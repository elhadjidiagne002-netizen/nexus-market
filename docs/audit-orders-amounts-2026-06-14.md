# Audit `orders` — colonnes montant & legacy — 2026-06-14

Suite de `docs/audit-db-2026-06-14.md` §⚠️-1 et §⚠️-2. Vérifié sur la **prod live**
(projet `pqcqbstbdujzaclsiosv`, via `scripts/db-query.mjs`) + grep complet du code
(`functions/**` + `public/index.html`). **Aucun montant modifié.** Ce document propose
une décision + une migration *à valider* (`database/migrations/2026_06_14_orders_columns_consolidation.sql`).

Population : **27 lignes** dans `orders` au moment de l'audit.

---

## 1. Colonnes montant — état live

| Colonne | Type / contrainte | Lignes peuplées | Plage | Devise | Verdict |
|---|---|---|---|---|---|
| **`total`** | `numeric`, NULLABLE | **27 / 27** (0 NULL) | 4.26 → 451.14 | **EUR** | ✅ **CANONIQUE** |
| `subtotal` | `numeric`, NULLABLE | 13 / 27 (ère récente) | 6.99 → 450.00 | EUR | ✅ garder (montant hors livraison) |
| `amount_eur` | `numeric` **NOT NULL def 0** | 27 « peuplées » mais **= 0** pour les 13 commandes récentes ; = `total` pour les 14 anciennes | 0 → 450.76 | EUR (miroir legacy) | 🗑️ **drop** (plus jamais écrite) |
| `order_total` | `numeric`, NULLABLE | **0 / 27** | — | — | 🗑️ **drop** (morte) |
| `amount_fcfa` | `integer`, NULLABLE | **0 / 27** | — | — | 🗑️ **drop** (morte) |

### Preuve que `total` est en **EUR** (et non FCFA)
1. **Chemin d'écriture** (`public/index.html:4885`) : `total = vendorTotal + shippingEur`
   où `vendorTotal = Σ prix produit` (prix catalogue en EUR) `+ shippingEur`. Suffixe `…Eur` explicite.
2. **Ère ancienne** (14 lignes du 17–18/05) : `total == amount_eur` à l'unité près — la colonne
   s'appelle littéralement *eur*.
3. **Échelle des valeurs** : 4.26 à 451.14, **jamais > 1000**. Des montants FCFA sénégalais
   seraient de l'ordre du millier (un produit à 6.99 ⇒ ~4 600 FCFA).
4. **Commentaires & code backend explicites** :
   - `functions/api/_lib/utils.js:119` « montant … converti en EUR (**devise de `orders.total`**) » ;
     validation paiement `expectedEur = Σ total` (`:148`).
   - `functions/api/webhooks/stripe.js:178` « **`orders.total` est en EUR** ».
   - `functions/api/payments/paytech/init.js:64` « total réel des commandes (`orders.total`, **EUR**) ».
   - Conversions EUR→XOF qui **multiplient** par 655.957 : cashback (`index.html:23639`
     `totalXof = total * EUR_TO_FCFA`), payouts (`functions/payout-request.js:113`,
     `functions/payout-history.js:55`).

> La note CLAUDE.md « le code suppose du FCFA » est **inexacte** : le chemin dominant
> (checkout → validation → payout → cashback) traite `total` comme de l'EUR. Restent
> quelques **bugs d'affichage/calcul ponctuels** (cf. §3) qui, eux, le mislabellisent « FCFA ».

### `vendor_daily_metrics` (vue)
Seule dépendance SQL sur `orders`. Elle agrège **`total`** (revenue/avg_basket/delivered_revenue)
et **`buyer_id`** — toutes deux canoniques et conservées. **Ne référence aucune** colonne à
supprimer ⇒ les drops sont sûrs vis-à-vis de la vue.

---

## 2. Colonnes legacy (doublons d'identité / dates)

| Colonne | Type | Live | Usage code | Verdict |
|---|---|---|---|---|
| `user_id` | `uuid` NULLABLE | 4 peuplées (toutes anciennes) ; **0 ligne** où `user_id` informe sans `buyer_id` | **Aucune écriture.** Lue seulement en *fallback* `buyer_id \|\| buyer \|\| user_id` (`index.html:23637`) | 🗑️ **drop** après retrait du fallback |
| `id_old` | `text` **NOT NULL def `gen_random_uuid()`** | 27 (auto-rempli par le default) ; = `id` à l'ère ancienne, uuid aléatoire sans signification ensuite | **Référencée nulle part** (grep `functions/` + `index.html` = ∅) | 🗑️ **drop** (bruit pur) |
| `canceled_at` | `timestamptz` NULLABLE | 2 peuplées, **identiques** à `cancelled_at` (both_equal=2, diff=0) | **Référencée nulle part.** Le code utilise `cancelled_at` (`functions/api/orders/[id]/status.js:45`, `functions/paytech-webhook.js:170`) | 🗑️ **drop** (miroir, 0 perte) |

`buyer_id` (FK `orders_buyer_id_fkey` ajoutée le 2026-06-14) est l'acheteur canonique ;
`cancelled_at` (double-l) est la date canonique ; `id` (uuid) est la PK canonique.

---

## 3. Bugs code révélés par l'audit (HORS périmètre drop — à corriger séparément)

Ces points n'empêchent pas les drops *sauf le (C) qui est un prérequis pour `amount_eur`/`amount_fcfa`*.

- **(C) — BLOQUANT pour drop `amount_eur`/`amount_fcfa`.** Lecture stale du tableau de bord
  vendeur `public/index.html:16892-16899` : mappe `total: r.amount_eur` (⇒ **0 pour toute
  commande depuis le 2026-05-21**) et `products: r.items` (la colonne canonique est `products`).
  ⇒ Le CA vendeur affiche **0** pour toutes les commandes récentes. **Corriger AVANT le drop**
  (`total: r.total ?? r.amount_eur ?? 0`, `products: r.products ?? r.items ?? []`).

- **(B) — calcul faux.** `functions/paytech-webhook.js:141-142` : « total est en FCFA →
  conversion en EUR » puis **divise** `total` par 655.957. Avec `total` en EUR (36.13),
  `amountEur ≈ 0.055` ⇒ **0 point fidélité** crédité via PayTech. Contredit la convention
  *multiplier* du reste du code. ⇒ Remplacer par `amountEur = Number(order.total)` directement.

- **(A) — libellés trompeurs.** Plusieurs notifications/e-mails rendent `order.total` (EUR)
  suffixé « FCFA » : `functions/api/payments/stripe/webhook.js:41`,
  `functions/api/payments/paytech/ipn.js:171,183`, `functions/paytech-webhook.js:113`,
  `functions/api/webhooks/paytech.js:24,46` (fichier orphelin). Un acheteur réglant 36,13 €
  voit « 36,13 FCFA reçu ». ⇒ Soit relabel « EUR », soit convertir `×655.957` à l'affichage
  (recommandé pour le marché sénégalais — cohérent avec le reste de l'UI).

---

## 4. Décision recommandée

### Devise/colonne canonique : **`total`, stocké en EUR**

**Option A — recommandée (risque financier nul).** Conserver l'EUR comme unité stockée :
100 % des lignes + toute la chaîne paiement/validation/payout/cashback opèrent déjà en EUR
et convertissent en XOF *à l'affichage*. On **ne réécrit aucune valeur** ; on supprime les
colonnes mortes et on corrige les bugs §3 dans un PR code séparé.

**Option B — rejetée.** Convertir les valeurs stockées en FCFA (`×655.957`). Réécrit *toutes*
les valeurs financières en prod, oblige à modifier *simultanément* tous les sites de conversion
(sinon double conversion), pour **aucun gain fonctionnel** (l'UI affiche déjà du FCFA converti).
Risque élevé, bénéfice nul.

### Plan d'exécution (ordonné)

| Étape | Action | Risque | Réécrit des montants ? |
|---|---|---|---|
| **0 — code** | Corriger §3-(C) (prérequis), idéalement §3-(B) et §3-(A) | faible | non |
| **1 — migration, drops sûrs** | `DROP COLUMN order_total, amount_fcfa, id_old, canceled_at, user_id` | nul (0 ligne informative / 0 usage code) | **non** |
| **2 — migration, drop legacy miroir** | `DROP COLUMN amount_eur` — **après** §3-(C) déployé | faible | **non** |
| **3 — durcissement (optionnel)** | `ALTER COLUMN total SET NOT NULL` (0 NULL constaté) | faible | non |

Lignes dont une **valeur monétaire change** : **0** (aucune réécriture).
Colonnes supprimées : **6** (`order_total`, `amount_fcfa`, `id_old`, `canceled_at`, `user_id`, `amount_eur`).

Migration prête : `database/migrations/2026_06_14_orders_columns_consolidation.sql`
(+ miroir `sql/`). **Non exécutée** — à valider explicitement avant `node scripts/db-query.mjs --file …`.
