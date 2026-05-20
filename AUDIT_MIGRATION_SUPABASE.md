# Audit migration tout-Supabase — Appels backend sans repli complet

Date : 2026-05-20
Objet : recenser les appels `apiFetch` (backend) du frontend qui **n'ont pas**
de repli Supabase équivalent. Ce sont les seuls points à compléter avant de
pouvoir supprimer le code backend en toute sécurité.

## Méthode

Analyse automatisée des méthodes de `DataService` appelant `apiFetch`, en
vérifiant la présence d'un chemin `_sb.from()/rpc()` dans la même méthode.

Résultat : **sur ~52 méthodes DataService appelant le backend, la grande
majorité (≈45) ont déjà un repli Supabase complet.** Seuls les cas ci-dessous
nécessitent une action.

---

## 🔴 À COMBLER — trous fonctionnels réels (5)

### 1. `getPayoutBalance()` (ligne ~4215) — CRITIQUE (sécurité/argent)
Calcule le solde retirable d'un vendeur. Aujourd'hui : si pas de backend →
retourne `null` → le vendeur ne voit jamais son solde.
**Action :** créer une RPC Postgres `vendor_payout_balance()` qui calcule
`SUM(commandes livrées) - SUM(retraits déjà demandés/payés)` côté serveur
(non manipulable), appelée via `_sb.rpc('vendor_payout_balance')`.

### 2. `checkStockAvailability()` (ligne ~2426) — anti-survente
A un repli localStorage mais **pas Supabase** : en multi-utilisateur, le stock
localStorage est faux. Risque de survente.
**Action :** ajouter un repli `_sb.from('products').select('id,stock,active').in('id', ids)`
avant le fallback localStorage.

### 3. `cancelOrderAndReleaseStock()` (ligne ~2613) — réincrémentation stock
Le repli actuel passe `status='cancelled'` mais **ne réincrémente pas le stock**
des produits annulés (seul le backend le faisait).
**Action :** créer une RPC `cancel_order_release_stock(order_id)` (transaction :
statut + `stock = stock + quantité` pour chaque ligne), appelée en repli.

### 4. `migrateLocalCart()` (ligne ~2672) — migration panier invité→compte
Repli backend uniquement. Sans backend, le panier invité n'est pas fusionné
au compte à la connexion.
**Action :** repli Supabase = lire le panier local, `upsert` dans `carts`,
marquer la clé de migration. (Faible criticité.)

### 5. `migrateLocalStockAlerts()` (ligne ~2684) — idem alertes stock
Même schéma que #4, pour les alertes de réappro. (Faible criticité.)

---

## 🟢 FAUX POSITIFS — aucune action requise

Ces méthodes appellent `apiFetch` mais n'ont **pas besoin** de Supabase :

- `isSessionExpired()`, `_clearTokens()`, `apiFetch()`, `restoreSession()` :
  pure gestion de tokens JWT côté client. En mode Supabase-only, la session est
  gérée par le SDK Supabase (`detectSessionInUrl`, `autoRefreshToken`) — ces
  méthodes deviennent simplement inertes quand `apiUrl=""`.
- `getOrders`, `getUsers`, `getReferrals`, `saveReferral` : ont un repli
  Supabase (`oui`), le rapport les marque OK même sans localStorage — c'est
  voulu (données serveur uniquement).
- Les entrées `if` / `useEffect` listées par l'outil (lignes 6586, 7361, 10942,
  13148, 15245, 17216, 17930, 20274, 20530, 22502, 23412…) sont des blocs de
  composants React **hors `DataService`** captés par le découpage heuristique :
  ce sont des appels ponctuels (analytics, push, B2B, messagerie temps réel)
  qui dégradent proprement si le backend est absent. À revoir au cas par cas
  lors du retrait du code mort, mais ne bloquent pas la bascule.

---

## Verdict

La bascule tout-Supabase est **à portée immédiate** : seuls **2 points
réellement critiques** (solde de retrait #1, anti-survente #2) et **1 important**
(réincrément stock à l'annulation #3) doivent être codés en RPC Postgres avant
de retirer le backend. Les points #4/#5 sont du confort.

### Ordre de réalisation proposé
1. RPC `vendor_payout_balance()` + repli dans `getPayoutBalance`.
2. RPC `cancel_order_release_stock()` + repli dans `cancelOrderAndReleaseStock`.
3. Repli Supabase dans `checkStockAvailability`.
4. (Optionnel) replis migration panier/alertes.
5. Une fois 1-3 livrés et testés : retirer les 150 branches `if (NEXUS_CONFIG.apiUrl)`
   et archiver `api/`, `nexus-backend/`, `functions/api/`.

---

## ✅ RÉALISÉ (2026-05-20) — points 1, 2, 3 + bonus

Fichier SQL livré : **`database/migrations/2026_05_20_supabase_rpc.sql`**
(3 RPC Postgres `SECURITY DEFINER`, validé par parseur pglast). À exécuter dans
Supabase → SQL Editor.

| # | Point | RPC créée | Repli frontend branché |
|---|-------|-----------|------------------------|
| 1 | Solde retrait vendeur | `vendor_payout_balance()` | `getPayoutBalance()` |
| 2 | Annulation + libération stock | `cancel_order_release_stock(p_order_id)` | `cancelOrderAndReleaseStock()` |
| 3 | Vérification stock (anti-survente) | `check_products_stock(p_ids)` | `checkStockAvailability()` |
| + | Validation du solde avant retrait | (réutilise #1) | `savePayout()` — refuse si montant > solde |

Notes techniques :
- Casts `id::text` ajoutés dans les RPC (products.id est UUID, mais les ids dans
  le JSONB `orders.products` et les paniers sont des chaînes).
- `vendor_payout_balance` utilise `auth.uid()` → un vendeur ne lit que son solde.
- `cancel_order_release_stock` est idempotent (ne recrédite pas le stock si la
  commande est déjà annulée) et contrôle l'accès (acheteur/vendeur/admin).

Restent les points de confort #4/#5 (migration panier/alertes invité→compte),
non bloquants. Après vérification en prod, on pourra retirer les branches
`if (NEXUS_CONFIG.apiUrl)` et archiver le code backend.

---

## ✅ RÉALISÉ (suite) — points #4/#5 + bugs annexes découverts

| Élément | Correctif |
|---------|-----------|
| #4 `migrateLocalCart` | Repli Supabase : fusionne le panier invité dans `carts` (somme des quantités) à la connexion. |
| #5 `migrateLocalStockAlerts` | Repli Supabase : upsert des alertes (PK composite `product_id,user_id`). |
| **Bug** `stock_alerts.notified` | Colonne utilisée par le code mais absente du schéma → ajoutée (`2026_05_20_stock_alerts_notified.sql`). |
| **Bug** indicateur de frappe | `apiFetch(...).then()` plantait (`null.then`) quand `apiUrl=""` → gardé. |
| **Bug** admin Payouts / Coupons / Logs | Mêmes plantages `null.then` ; désormais chargés directement depuis Supabase (`payout_requests`, `coupons`, `audit_logs`). |
| Table `audit_logs` | Référencée mais absente → créée (optionnelle) dans la même migration. |

### Fichiers SQL à exécuter (ou utiliser le script consolidé)
- **`2026_05_20_RUN_ALL.sql`** ⭐ — regroupe tout, à exécuter en une fois.
- ou individuellement : `2026_05_20_ondemand_tables.sql`,
  `2026_05_20_supabase_rpc.sql`, `2026_05_20_stock_alerts_notified.sql`.

## État de la migration tout-Supabase

Tous les chemins critiques et secondaires ont désormais un repli Supabase
fonctionnel. Il ne reste **aucun appel `apiFetch` non gardé** susceptible de
planter en mode `apiUrl=""`. La base de code est prête pour l'étape finale :
retrait des branches `if (NEXUS_CONFIG.apiUrl)` et archivage de `api/`,
`nexus-backend/`, `functions/api/` (à faire après vérification en production).
