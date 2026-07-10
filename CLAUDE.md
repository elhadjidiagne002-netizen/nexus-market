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
- ✅ **Nettoyage legacy effectué (consolidation)** : les colonnes redondantes
  `amount_eur`, `amount_fcfa`, `order_total`, `user_id` (doublon de `buyer_id`), `id_old`,
  `canceled_at` (doublon de `cancelled_at`) ont été **supprimées** (vérifié 2026-06-16).
  Colonnes de montant restantes : **`total`** (canonique) et `subtotal`. Autres legacy
  encore présentes mais utiles : `paid_at`, `paytech_token`, `failure_reason`, `cancelled_at`.
- 💶 **Convention monétaire = EUR (tranchée 2026-06-16)** : `total`, `subtotal` ET
  `products[].price` sont **uniformément en EUR** (vérifié 41/41 commandes : total ∈ [4.26,
  451.14] ; ex. boubou subtotal 34.99 = price 34.99). Affichage FCFA = **× 655.957**
  (`round(total*655.957)`), comme le font déjà les triggers WhatsApp et `/api/order-email`.
  Ce n'est donc PAS une incohérence de données — toute la pile est en EUR, seul l'affichage
  est en FCFA. Conserver ×655.957 pour tout montant montré à l'utilisateur.

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
`database/migrations/` et `sql/` définissent parfois les **mêmes tables différemment**.
✅ **TRANCHÉ sur la base déployée (vérifié 2026-06-16)** — le canonique = les définitions
**`sql/`** (que le code attend) ; les variantes `database/migrations/` sont **périmées** :
- `orders.id` = **`UUID`** en prod (PAS `TEXT`).
- `loyalty_points` = **table de SOLDE** `user_id/points/total_earned/total_redeemed/updated_at`
  (`sql/loyalty_migration.sql`) — c'est ce que lit `functions/loyalty.js` (`.select('points')`,
  RPC `add_loyalty_points`). PAS le grand-livre `earn/redeem`.
Règle : **en cas de divergence des deux dossiers, `sql/` fait foi** (= prod). Ne PAS
rejouer une migration `database/migrations/` qui contredit ça sur la base prod. Les deux
s'accordent sur `buyer_id/vendor_id/total/payment_status`.

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
- **Alias IPN commande** : `/api/webhooks/paytech` = `functions/api/webhooks/paytech.js`,
  qui **délègue** désormais à `/api/payments/paytech/ipn` (`export { onRequest } from …`).
  Auparavant orphelin ET cassé (cherchait `orders.mobile_money_ref = token`, jamais
  renseigné par le flux commande → 404). Rendu safe pour qu'une URL IPN globale mal
  configurée côté dashboard PayTech ne puisse plus avaler un paiement (2026-07-09).
- Tous les webhooks **vérifient la signature** (HMAC SHA-256, anti-replay 5 min).
- ⚠️ **URL IPN à configurer dans le dashboard PayTech** = `https://nexusmarket.sn/api/payments/paytech/ipn`
  (ou vide, pour laisser `init.js` fournir l'`ipn_url` par requête). Vérifié vivant :
  POST non signé → 401 « Hash invalide », GET → 405.

## Variables d'environnement
Voir `.env.example`. Le `.env` réel n'est pas versionné. Manquaient à la config :
`PAYTECH_API_KEY/SECRET`, `RESEND_API_KEY`, `ADMIN_USER_ID`.

## WhatsApp — généralisé à tous les événements email (2026-07-10)
`functions/api/_lib/notify.js` expose désormais `sendEventWhatsApp` (gabarits texte
`WA_DEFAULTS`, gating `notification_events.whatsapp_enabled`, log `whatsapp_logs`) et
`sendEventNotification(env, eventKey, {email, phone, userId}, vars)` qui envoie EMAIL +
WHATSAPP en parallèle pour le même événement (best-effort, indépendants). Tous les
appelants de `sendEventEmail` ont été migrés vers `sendEventNotification` : webhooks
paiement (Stripe, PayTech), payout (demande/traité/échoué), offres sur story, stock
faible/de retour/baisse de prix, `notify-user.js` (résout email+téléphone via
`profiles`), `notify-admin.js` (env `ADMIN_PHONE` en plus de `ADMIN_EMAIL`),
`order-email.js` (commande confirmée acheteur). L'envoi WhatsApp direct (sans repasser
par un fetch HTTP vers `/api/whatsapp`) vit dans `functions/api/_lib/wa-send.js`
(partagé avec l'endpoint HTTP, qui l'utilise pour rester dédupliqué). ⚠️ Le vendeur
n'a PAS de WhatsApp doublé sur `vendor_new_order` : le trigger DB
`trg_new_order_vendor_whatsapp` (SQL, sur INSERT orders) envoie déjà un message
équivalent — `order-email.js` reste email-only pour ce cas précis. 3 triggers DB
(`_order_confirm_email`, `_offer_emails`, `_low_stock_alert`) ont été mis à jour
(`sql/2026_07_10_generalize_whatsapp_notifications.sql`, appliqué en prod) pour
transmettre `buyer_phone`/`vendor_phone`/`phone` aux endpoints correspondants.

## WhatsApp — double fournisseur (Green API + WAHA)
`functions/api/whatsapp.js` essaie **Green API** en premier (`GREEN_API_INSTANCE_ID`/
`GREEN_API_TOKEN`), puis bascule automatiquement sur **WAHA** (self-hosted, Render
Starter, `WAHA_BASE_URL`/`WAHA_API_KEY`/`WAHA_SESSION=nexus-market`) si Green API échoue
(quota 466, instance déconnectée, panne réseau). Sans variables `WAHA_*` configurées,
comportement inchangé (Green API seul). Le panneau admin WhatsApp (React) affiche l'état
réel des deux via `GET /api/whatsapp` — les champs Instance ID/Token du même panneau
(Supabase `whatsapp_config`) n'ont **aucun effet** sur l'envoi réel, gardés uniquement
pour le bouton diagnostic « Vérifier la connexion ». Détails/pièges de déploiement WAHA :
mémoire `whatsapp-green-api-quota-466`.

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
- **Devis de livraison transporteur** : `functions/api/shipping-quote.js` est un stub
  (`[TODO] Brancher un vrai transporteur`) — intégration DHL/GIG/SENPOST réelle à faire
  (clés présentes dans `.env`, mais specs API requises).
- **Paiement monétisation via Wave/OM** : les liens Wave/Orange Money n'ont pas de callback
  → boosts/abonnements/flash/priorité B2B payés ainsi restent `pending` (activation manuelle
  admin). Canal automatisé = **PayTech** (IPN). Stories payantes : flux PayTech **câblé**
  (2026-06-16, `kind:'story'` dans init/ipn + `validateStoryFee`). Wave/OM auto = nécessite
  l'API Wave Business.
- Unification physique des deux dossiers de migrations : la divergence sémantique est
  **tranchée** (§4, `sql/` fait foi = prod) ; reste le housekeeping (dédupliquer/aligner les
  fichiers). Non bloquant.
- Réponses API non standardisées (`{error}` vs `{ok:false,error}`) : helper canonique
  = `functions/api/_lib/response.js` (`ok`/`err`) ; migration progressive recommandée.
- Webhook `functions/api/webhooks/paytech.js` : n'est plus un doublon inerte — il
  **délègue** au handler IPN canonique (cf. « Endpoints de paiement » ci-dessus).
- Frontend monolithique (`public/index.html`), pas de TypeScript : refonte hors périmètre.

### ✅ Déjà résolus — ne plus lister (vérifié 2026-06-16)
`api_keys` (table) + `api_key_validate` (RPC) **existent** ; `payout_requests.amount_xof`
**présent** ; `vercel.json`/`render.yaml`/`Dockerfile` **supprimés** ; `payout-request.js`
utilise déjà **`ADMIN_USER_ID`** (plus de `user_id="admin"` en dur).
