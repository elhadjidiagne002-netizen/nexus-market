# NEXUS Market — Backend (Cloudflare Pages Functions)

## Structure
```
functions/api/          ← 48 routes API
  _lib/
    supabase.js         ← Client Supabase + auth helpers
    response.js         ← Helpers CORS/JSON/error
  health.js
  auth/login.js
  auth/register.js
  auth/me.js
  ... (voir liste complète ci-dessous)
supabase/
  schema.sql            ← 24 tables + triggers + séquences
  rls.sql               ← Row Level Security (RLS)
wrangler.toml           ← Configuration Cloudflare Pages
.dev.vars               ← Variables d'env locales (ne pas committer)
```

## Déploiement — 3 étapes

### Étape 1 — Supabase
1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **SQL Editor > New Query**
3. Coller et exécuter `supabase/schema.sql`
4. Coller et exécuter `supabase/rls.sql`
5. Créer un **Storage bucket** `nexus-media` (public)
6. Récupérer `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Étape 2 — Cloudflare Pages
1. Créer un projet Pages sur [dash.cloudflare.com](https://dash.cloudflare.com)
2. Connecter votre dépôt GitHub contenant ce dossier
3. Ajouter les **secrets** dans Settings > Environment variables :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | https://xxx.supabase.co |
| `SUPABASE_ANON_KEY` | eyJhbGc... |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJhbGc... |
| `PAYTECH_API_KEY` | Clé PayTech |
| `PAYTECH_SECRET_KEY` | Secret PayTech |
| `STRIPE_SECRET_KEY` | sk_live_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... |
| `RESEND_API_KEY` | re_... (optionnel) |
| `SITE_URL` | https://nexus-market-asb.pages.dev |

### Étape 3 — Paiements
**PayTech**
1. Compte sur [paytech.sn](https://paytech.sn)
2. API → Générer API Key + Secret Key
3. Configurer IPN URL : `https://votre-domaine.pages.dev/api/payments/paytech/ipn`

**Stripe**
1. Compte sur [stripe.com](https://stripe.com)
2. Récupérer `sk_live_...` (ou `sk_test_...` pour les tests)
3. Webhook : ajouter `https://votre-domaine.pages.dev/api/payments/stripe/webhook`
4. Mettre `STRIPE_WEBHOOK_SECRET` dans les env vars

**Resend (emails)**
1. Compte sur [resend.com](https://resend.com) (gratuit 3000 emails/mois)
2. Vérifier votre domaine `nexus.sn`
3. Récupérer la clé API `re_...`

## Développement local
```bash
npm install
cp .dev.vars.example .dev.vars   # Remplir les valeurs
npm run dev                       # Lance sur http://localhost:8788
```

## Routes disponibles (48)

### Auth
- `POST /api/auth/login` — Connexion email/password
- `POST /api/auth/logout` — Déconnexion
- `POST /api/auth/register` — Inscription (buyer/vendor/buyer_pro)
- `GET  /api/auth/me` — Profil courant
- `POST /api/auth/change-password` — Changer mot de passe
- `POST /api/auth/reset-password` — Réinitialisation par email
- `POST /api/auth/resend-confirmation` — Renvoyer email confirmation
- `POST /api/auth/refresh` — Refresh token
- `GET  /api/auth/github` — OAuth GitHub redirect
- `POST /api/auth/github/role` — Assigner rôle post-OAuth
- `GET/PATCH /api/profiles/me` — Profil utilisateur

### Catalogue
- `GET/POST/PUT/DELETE /api/products` — CRUD produits

### Commandes
- `GET/POST/PATCH /api/orders` — Commandes
- `GET/PUT/DELETE /api/cart` — Panier persistant
- `POST /api/cart/migrate` — Migration panier local → serveur
- `GET/POST/PATCH /api/offers` — Offres acheteur
- `GET /api/invoices` — Factures

### Paiements
- `POST /api/payments/paytech/init` — Initier paiement PayTech
- `POST /api/payments/paytech/ipn` — Webhook IPN PayTech
- `GET  /api/payments/paytech/verify/:orderId` — Vérifier paiement
- `POST /api/payments/stripe/create-intent` — Créer PaymentIntent Stripe
- `POST /api/payments/stripe/webhook` — Webhook Stripe

### Retraits
- `POST /api/payout/request` — Demande de retrait vendeur
- `GET  /api/payout/history` — Historique retraits
- `GET  /api/payouts/balance` — Solde disponible
- `GET/PATCH /api/payouts/requests` — Gestion retraits (admin)
- `POST /api/refunds` — Remboursement (admin)

### Avis / Litiges / Retours
- `GET/POST /api/reviews` — Avis produits
- `GET/POST/PATCH /api/disputes` — Litiges
- `(via Supabase direct)` — Demandes de retour

### Messagerie
- `GET/POST /api/messages` — Messages
- `POST /api/messages/read` — Marquer lu
- `GET/PATCH /api/notifications` — Notifications

### Codes promo
- `GET/POST/PATCH/DELETE /api/coupons` — CRUD codes promo
- `POST /api/coupons/validate` — Valider un code

### Parrainage
- `GET /api/referrals` — Mes parrainages

### B2B
- `GET/POST/PATCH /api/b2b/profile` — Profil entreprise
- `GET /api/b2b/orders` — Commandes B2B
- `GET /api/b2b/discount` — Taux de remise
- `POST /api/b2b/register` — Inscription acheteur pro
- `GET /api/b2b/verify-ninea/:userId` — Vérification NINEA (admin)

### Utilitaires
- `POST /api/email/send` — Envoyer un email (Resend)
- `POST /api/upload` — Upload fichier (Supabase Storage)
- `GET  /api/health` — Healthcheck

### Admin
- `GET /api/admin/stats` — Statistiques dashboard
- `GET/PATCH /api/admin/users` — Gestion utilisateurs
- `POST /api/admin/users/:uid/ban` — Bannir utilisateur
- `GET /api/admin/vendors/pending` — Vendeurs en attente
- `POST /api/admin/vendors/:id/approve` — Approuver/rejeter vendeur
- `GET /api/admin/payouts` — Tous les retraits
- `GET /api/admin/logs` — Journal activité
- `GET /api/admin/logs/summary` — Résumé logs 7j
- `GET /api/admin/export/orders` — Export CSV commandes
- `GET /api/admin/export/users` — Export CSV utilisateurs
- `GET /api/admin/export/vendors` — Export CSV vendeurs
- `GET/PATCH /api/admin/b2b` — Gestion acheteurs B2B
- `GET /api/admin/b2b/stats` — Stats B2B
- `GET/PATCH /api/admin/b2b/:userId` — Profil B2B individuel
