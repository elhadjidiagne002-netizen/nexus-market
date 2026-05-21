# NEXUS Market — Corrections (2026-05-20)

Résumé des bugs corrigés et des actions de configuration restantes.

L'application tourne en **mode Supabase-only** (`NEXUS_CONFIG.apiUrl = ""`).
Toutes les données passent donc directement par le client Supabase, et la
plupart des bugs venaient d'écritures Supabase vers des colonnes/tables qui
n'existaient pas — ces écritures échouaient silencieusement, l'app retombait
sur `localStorage`, et les changements « revenaient » après actualisation.

---

## 1. Commandes : « livrer / annuler » se réinitialise après actualisation  ✅ corrigé

Cause : le tableau de bord écrivait des colonnes inexistantes dans la table `orders`.

| Écrit (bugué)   | Colonne réelle du schéma |
|-----------------|--------------------------|
| `paid_at`       | `delivered_at`           |
| `canceled_at`   | `cancelled_at`           |
| `failure_reason`| `cancel_reason`          |

Corrections dans `index.html` (et `public/index.html`) :
- `updateOrderStatus` (admin **et** vendeur) : écrit les bonnes colonnes
  (`processing_at`, `in_transit_at`, `delivered_at`, `cancelled_at`).
- Ajout de `.select("id")` après chaque `UPDATE` : un update qui ne touche
  aucune ligne (blocage RLS) ne renvoie **pas** d'erreur PostgREST. On vérifie
  désormais `data.length` ; si 0 ligne, on annule la mise à jour optimiste et
  on affiche un vrai message d'erreur au lieu d'un faux « succès ».
- Chemin d'annulation paiement : `canceled_at`/`failure_reason` →
  `cancelled_at`/`cancel_reason`.

## 2. `DataService.updateOrder` — mapping camelCase → snake_case  ✅ corrigé

`updateOrder(id, { returnStatus, returnId })` envoyait les clés camelCase
telles quelles → colonnes inconnues → échec. Ajout d'une table de
correspondance `_ORDER_COL_MAP` et de `_mapOrderCols()`. Détection 0-ligne
ajoutée également. Impactait les **demandes de retour**.

## 3. `saveOrder` — schéma de commande erroné  ✅ corrigé

Écrivait un ancien schéma (`user_id`, `amount_eur`, `items`, `buyer_address`)
qui ne correspond à aucune colonne réelle. Réécrit selon le schéma canonique
(`buyer_id`, `vendor_id`, `buyer_name`, `products`, `subtotal`, `total`,
`commission`, …). C'est un *fallback* (le chemin principal est la RPC
`create_order_atomic`), mais le bug était latent.

## 4. Connexion Google / GitHub (OAuth)  ✅ corrigé côté code

Le nettoyage d'URL post-OAuth ne retirait que le `#access_token` (flux
implicite). Or supabase-js v2 utilise par défaut le flux **PKCE** : l'URL de
retour contient `?code=...&state=...`. Ces paramètres restaient en place ; un
simple rechargement tentait alors de ré-échanger un code déjà consommé →
erreur / déconnexion. Le nettoyage retire désormais `code`, `state`, `error`,
`error_description`, `provider_token` **et** le hash.

> ⚠️ **Action de configuration requise (hors code) :** si « Se connecter avec
> Google » échoue encore, c'est la config Supabase. Dans le Dashboard Supabase :
> - **Authentication → Providers → Google** : activer + renseigner le
>   *Client ID* et *Client Secret* (créés dans Google Cloud Console, écran
>   OAuth + identifiants « Application Web »).
> - **Authentication → URL Configuration** :
>   - *Site URL* = `https://nexus-market-md360.vercel.app`
>   - *Redirect URLs* = ajouter `https://nexus-market-md360.vercel.app/`
>     (et l'URL de preview si besoin).
> - Côté **Google Cloud Console**, dans les *URI de redirection autorisés* de
>   l'identifiant OAuth, ajouter :
>   `https://pqcqbstbdujzaclsiosv.supabase.co/auth/v1/callback`

## 5. Marketplace « OnDemand » : demandes/offres perdues  ✅ corrigé

Les tables `buyer_requests` et `vendor_offers` étaient utilisées par le code
mais **créées dans aucune migration**. Deux corrections :
- `acceptOffer()` filtrait par `request_id` alors que la FK réelle est
  `original_offer_id` (corrigé).
- Nouveau fichier **`database/migrations/2026_05_20_ondemand_tables.sql`** :
  crée les deux tables, les index, le trigger `offers_count`, et les policies
  RLS. **À exécuter dans Supabase → SQL Editor.**

## 6. `netlify.toml` — marqueurs de conflit Git  ✅ corrigé

Le fichier contenait 7 blocs `<<<<<<< / ======= / >>>>>>>` non résolus, ce qui
le rendait invalide. Fusionné proprement (toutes les redirections des deux
versions conservées, dont `/api/loyalty`, + `AWS_LAMBDA_JS_RUNTIME`).

---

## Fichiers modifiés / ajoutés

- `index.html` — corrections 1-5 *(sauvegarde : `index.html.bak`)*
- `public/index.html` — synchronisé avec la version corrigée
- `netlify.toml` — conflits résolus *(sauvegarde : `netlify.toml.bak`)*
- `database/migrations/2026_05_20_ondemand_tables.sql` — **nouveau, à exécuter**

## Vérifications effectuées

- `node --check` sur tous les blocs `<script>` inline des deux `index.html` : OK.
- Recherche des marqueurs de conflit Git dans tout le projet : plus aucun.
- Cohérence des noms de colonnes `orders` confirmée contre le schéma canonique
  (`database/migrations/all_supabase.txt`).

---

## Mise à jour (suite au diagnostic de votre base réelle)

Le diagnostic a montré que `buyer_requests` et `vendor_offers` **existaient déjà**,
et que `vendor_offers` possède **deux** colonnes FK : `request_id` (NOT NULL,
historique) et `original_offer_id` (ajoutée ensuite, partiellement vide).

- **Erreur 42703** : venait de la 1re migration qui supposait une table neuve.
- **Bug réel sous-jacent** : le frontend n'écrivait que `original_offer_id`,
  donc l'insert violait le `NOT NULL` de `request_id` → offre perdue au refresh.

Corrections finales :
- **Code** (`createVendorOffer`) : écrit désormais **les deux** colonnes FK.
- **SQL** (`2026_05_20_ondemand_tables.sql`, réécrit) : rend `request_id`
  nullable, comble les valeurs manquantes dans les deux sens, installe un
  trigger de synchro `request_id <-> original_offer_id`, et repose les policies
  RLS qui testent les deux colonnes via `COALESCE`. Ne supprime rien, rejouable.
