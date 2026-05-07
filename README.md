# NEXUS Market — Migration Netlify → Cloudflare Pages

## Structure du projet

```
/
├── functions/                     ← Cloudflare Pages Functions (équivalent /.netlify/functions/)
│   ├── _middleware.js             ← Middleware partagé (CORS automatique sur toutes les routes)
│   ├── loyalty.js                 ← Programme de fidélité
│   ├── payout-history.js          ← Historique et solde des retraits vendeur
│   ├── payout-request.js          ← Demande de retrait PayTech
│   ├── paytech-payout-webhook.js  ← IPN PayTech (retraits)
│   ├── paytech-webhook.js         ← IPN PayTech (paiements commandes)
│   ├── payments-mobile-money.js   ← Initiation paiement Mobile Money
│   ├── push-send.js               ← Envoi notifications Web Push
│   ├── push-subscribe.js          ← Abonnement / désabonnement push
│   └── push-vapid-key.js          ← Clé publique VAPID
├── _routes.json                   ← Règles de routage Cloudflare Pages
├── wrangler.toml                  ← Configuration Cloudflare (compat, vars)
└── package.json
```

---

## Différences clés Netlify → Cloudflare

| Netlify Functions | Cloudflare Pages Functions |
|---|---|
| `exports.handler = async (event) => {}` | `export async function onRequest(context) {}` |
| `event.httpMethod` | `context.request.method` |
| `event.headers["x-header"]` | `context.request.headers.get("x-header")` |
| `event.body` (string) | `await context.request.json()` ou `.text()` |
| `process.env.MA_VAR` | `context.env.MA_VAR` |
| `return { statusCode, headers, body }` | `return new Response(body, { status, headers })` |
| Module `https` (Node.js) | `fetch()` natif (Web API) |
| Module `crypto` (Node.js) | `crypto.subtle` (Web Crypto API) |
| `/.netlify/functions/nom` | `/functions/nom` |

---

## Installation et déploiement

### 1. Prérequis
```bash
npm install
```

### 2. Générer les clés VAPID (si pas encore fait)
```bash
npx web-push generate-vapid-keys
# Copier les clés dans les variables d'environnement
```

### 3. Configurer les variables d'environnement secrètes
```bash
# Via CLI (une par une)
npx wrangler pages secret put SUPABASE_SERVICE_KEY
npx wrangler pages secret put PAYTECH_API_KEY
npx wrangler pages secret put PAYTECH_API_SECRET
npx wrangler pages secret put PAYTECH_SECRET_KEY
npx wrangler pages secret put VAPID_PUBLIC_KEY
npx wrangler pages secret put VAPID_PRIVATE_KEY
```

Ou via le **Dashboard Cloudflare** :
`Pages → nexus-market → Settings → Environment variables`

### 4. Variables non-secrètes (déjà dans wrangler.toml)
Ces variables peuvent être éditées directement dans `wrangler.toml` :
- `PAYTECH_ENV` → `"prod"` ou `"test"`
- `SITE_URL` → URL de production du site
- `FRONTEND_URL` → même valeur que SITE_URL
- `VAPID_EMAIL` → email de contact VAPID
- `NEXUS_COMMISSION` → `"0.15"` (15%)
- `EUR_TO_XOF` → `"655.957"`

### 5. Développement local
```bash
npm run dev
# Démarre sur http://localhost:8788
# Les Functions sont disponibles sur http://localhost:8788/functions/loyalty etc.
```

### 6. Déploiement
```bash
npm run deploy
```

---

## Mise à jour du frontend (index.html)

Les URLs des fonctions changent. Remplacer dans `index.html` et les fichiers JS client :

```js
// AVANT (Netlify)
/.netlify/functions/loyalty
/.netlify/functions/payout-history
/.netlify/functions/payout-request
/.netlify/functions/paytech-payout-webhook
/.netlify/functions/paytech-webhook
/.netlify/functions/payments-mobile-money
/.netlify/functions/push-send
/.netlify/functions/push-subscribe
/.netlify/functions/push-vapid-key

// APRÈS (Cloudflare Pages)
/functions/loyalty
/functions/payout-history
/functions/payout-request
/functions/paytech-payout-webhook
/functions/paytech-webhook
/functions/payments-mobile-money
/functions/push-send
/functions/push-subscribe
/functions/push-vapid-key
```

Commande sed pour remplacer automatiquement :
```bash
sed -i 's|/.netlify/functions/|/functions/|g' index.html
```

---

## Mettre à jour les IPN PayTech

Dans votre dashboard PayTech, mettre à jour les URLs de webhook :
- Paiements : `https://nexus-market.pages.dev/functions/paytech-webhook`
- Retraits   : `https://nexus-market.pages.dev/functions/paytech-payout-webhook`

---

## Tables Supabase requises

Aucun changement de schéma nécessaire. Les tables utilisées restent :
- `loyalty_points` — solde points par utilisateur
- `loyalty_history` — historique des transactions points
- `orders` — commandes (champs : `total`, `commission`, `vendor`, `status`, `user_id`, `paytech_token`)
- `payout_requests` — demandes de retrait vendeur
- `push_subscriptions` — abonnements Web Push
- `notifications` — notifications in-app
- `users` — profils utilisateurs

### Fonction SQL requise (inchangée)
```sql
-- add_loyalty_points(p_user_id, p_delta, p_reason, p_order_id, p_note)
-- Doit être créée dans Supabase si ce n'est pas déjà fait.
```

---

## Notes importantes

### `nodejs_compat`
Le flag `nodejs_compat` dans `wrangler.toml` est **obligatoire** pour :
- `@supabase/supabase-js` (utilise `process`, `Buffer`, etc.)
- `web-push` (utilise le module `crypto` Node.js)

### `context.waitUntil()`
Cloudflare Workers se terminent dès que la `Response` est retournée.
Pour les tâches asynchrones post-réponse (ex: créditer les points de fidélité
après confirmation PayTech), on utilise `context.waitUntil(promise)` qui
garantit que la tâche se termine même après l'envoi de la réponse.

### Limites Cloudflare Pages Functions (plan gratuit)
- 100 000 requêtes/jour
- Temps d'exécution max : 30s (plan gratuit) / illimité (Paid)
- Mémoire : 128 MB
- Pour des besoins plus importants → Cloudflare Workers (plan Paid)
