# NEXUS Market — Notes pour Claude / contributeurs

Marketplace (Sénégal) : frontend monolithique `public/index.html` (React via CDN) +
backend serverless **Cloudflare Pages Functions** (`functions/`) + **Supabase** (Postgres/Auth).

## Architecture
- **Frontend** : `public/index.html` (single-file, React global, ~37k lignes).
- **Backend** : `functions/**` — chaque fichier = une route Cloudflare Pages Function.
  Runtime **Workers (V8)**, pas Node.js → pas de modules Node natifs.
- **Base** : Supabase. Accès backend via service key (bypasse RLS) ou REST/SDK.
- **Paiements** : Stripe (carte) + PayTech (mobile money Sénégal).

## ⚠️ Pièges critiques (sources de bugs récurrents)

### 1. Table `orders` — noms de colonnes
- L'acheteur est **`buyer_id`** (PAS `user_id`), le vendeur **`vendor_id`** (PAS `vendor`).
- Le montant est **`total`** (en FCFA), il n'existe **pas** de `amount_eur`.
- `status` ∈ `{pending, pending_payment, processing, in_transit, delivered, cancelled}`
  (contrainte live `orders_status_check` — `pending` inclus, vérifié 2026-06-14).
- `payment_status` ∈ `{pending, paid, failed, refunded, partially_refunded}`.
- `payment_method` ∈ `{card, mobile, cod}` (jamais `'stripe'` ; `cod` = paiement à la livraison).
- Colonnes existantes utiles : `stripe_payment_id`, `mobile_money_ref`, `processing_at`,
  `cancelled_at`, `cancel_reason`, `admin_notes`.
- ⚠️ **Dette legacy vérifiée le 2026-06-14** : la table contient AUSSI des colonnes
  redondantes/legacy bien présentes en prod (contrairement à d'anciennes notes) :
  `amount_eur` (NOT NULL def 0), `amount_fcfa`, `order_total`, `subtotal`, `paid_at`,
  `paytech_token`, `failure_reason`, `user_id` (doublon de `buyer_id`), `id_old`,
  `canceled_at` (doublon de `cancelled_at`). **Canonique** : `total` (montant), `buyer_id`,
  `vendor_id`, `id` (uuid). ⚠️ Les valeurs de `total` observées sont en **EUR** (ex. 36.13),
  pas en FCFA — incohérence sémantique à trancher avant d'unifier les colonnes montant.

### 2. Table `notifications` — contrainte sur `type`
`type` ∈ `{order, offer, message, return, vendor, system, dispute, new_vendor}` (contrainte
live `notifications_type_check`, vérifiée 2026-06-14 — `new_vendor` inclus).
Toute autre valeur (`payment`, `payout`, `stock_alert`, `new_order`…) fait échouer l'INSERT.
Pas de colonne `metadata` ni `order_id` → utiliser `link` (TEXT).

### 3. Table `payout_requests`
Le code attend des colonnes ajoutées par `database/migrations/2026_06_03_payout_requests_align.sql`
(`amount_xof`, `ref_command`, `paytech_token`, `paid_at`, `failed_at`, `failure_reason`,
`vendor_email`) + statuts `processing`/`failed`. **Exécuter cette migration.**

### 4. DEUX jeux de migrations qui divergent ⚠️
`database/migrations/` et `sql/` définissent parfois les **mêmes tables différemment** :
- `orders.id` : `TEXT` (database/migrations) vs `UUID` (sql/).
- `loyalty_points` : grand livre `earn/redeem` (database/migrations) vs table de **solde**
  `points/total_earned/total_redeemed` (`sql/loyalty_migration.sql`, attendue par le code).
Le schéma réellement déployé dépend de l'ordre d'exécution en prod. **À réconcilier**
(nécessite un accès à la base déployée). Les deux s'accordent toutefois sur
`buyer_id/vendor_id/total/payment_status`.

### 5. Variable secret PayTech — deux conventions
Flux commande (`paytech/init.js`, `paytech/ipn.js`) : `PAYTECH_API_SECRET`.
Flux mobile-money/payout : `PAYTECH_SECRET_KEY`. Le code accepte désormais les deux
(fallback `env.PAYTECH_API_SECRET || env.PAYTECH_SECRET_KEY`). Canonique : `PAYTECH_API_SECRET`.

## Endpoints de paiement (canoniques vs doublons)
- **Stripe webhook** : `/api/webhooks/stripe` (`functions/api/webhooks/stripe.js`) — configuré.
  Doublon : `/api/payments/stripe/webhook` (corrigé, mais non principal).
- **PayTech IPN commande** : `/api/payments/paytech/ipn` (configuré par `paytech/init.js`).
- **PayTech IPN mobile-money** : `/functions/paytech-webhook` (configuré par `payments-mobile-money.js`).
- **PayTech IPN payout** : `/functions/paytech-payout-webhook`.
- **Orphelin (non branché)** : `functions/api/webhooks/paytech.js`.
- Tous les webhooks **vérifient la signature** (HMAC SHA-256, anti-replay 5 min).

## Variables d'environnement
Voir `.env.example`. Le `.env` réel n'est pas versionné. Manquaient à la config :
`PAYTECH_API_KEY/SECRET`, `RESEND_API_KEY`, `ADMIN_USER_ID`.

## Vérifications avant commit
- `node --check <fichier.js>` sur les functions modifiées (runtime Workers, pas de test runner backend).
- Tests E2E : `tests/checkout.spec.js` (Playwright, nécessite un serveur lancé).

## Authentification & refresh tokens
Le projet utilise **Supabase Auth** (`signInWithPassword`, `setSession` côté frontend).
Supabase gère **nativement** les refresh tokens (rotation automatique de l'access token).
→ La table `refresh_tokens` et les vars `REFRESH_TOKEN_SECRET` / `JWT_REFRESH_EXPIRES`
ne sont utilisées **nulle part** : ce sont des vestiges d'une approche JWT custom abandonnée.
**Ne pas** implémenter de flux refresh custom (redondant, risque de conflit avec Supabase).
Action de nettoyage possible : supprimer ces vars/table inutilisées.

## Rate limiting
Helper `functions/api/_lib/ratelimit.js` (backé Postgres, migration
`2026_06_03_rate_limits.sql`, **fail-open**). Appliqué à `/api/sms` (5/min),
`/api/whatsapp` (10/min), `/payments-mobile-money` (10/min), par IP (`CF-Connecting-IP`).
Purge des compteurs >24h dans le cron cleanup.

## Tests
- Unitaires : `npm run test:unit` (`node --test`, ex. `tests/unit/validate.test.js`).
- E2E : `npm test` (Playwright, `tests/checkout.spec.js`, nécessite un serveur).

## Documentation API
`docs/openapi.yaml` (OpenAPI 3.1, sous-ensemble cœur). Lint/format : `npm run lint`,
`npm run format`.

## Manquements connus non résolus (nécessitent décision/accès)
- Réconciliation des deux jeux de migrations (cf. §4).
- `api_keys` / RPC `api_key_validate` (utilisés par `products-feed.js`) non définis.
- `notifications.user_id = "admin"` dans `payout-request.js` : doit être un UUID (`ADMIN_USER_ID`).
- Réponses API non standardisées (`{error}` vs `{ok:false,error}`) : helper canonique
  = `functions/api/_lib/response.js` (`ok`/`err`) ; migration progressive recommandée.
- Cibles de déploiement multiples (`vercel.json`, `render.yaml`, `Dockerfile`) : la cible
  active est **Cloudflare Pages** (cf. `wrangler.toml`) ; les autres sont à retirer si inutilisées.
- Frontend monolithique (`public/index.html`), pas de TypeScript : refonte hors périmètre.
