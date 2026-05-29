# NEXUS Market

Marketplace e-commerce sénégalaise — Cloudflare Pages + Supabase + PayTech + Cloudinary

## Stack
- **Frontend** : Single-file React app (`public/index.html`)
- **Backend** : Cloudflare Pages Functions (`functions/`)
- **Base de données** : Supabase (PostgreSQL)
- **Images** : Cloudinary (cloud: `dlbil4ef6`, preset: `nexus-market`)
- **Paiements** : PayTech Mobile Money + Stripe
- **Notifications** : Web Push VAPID + EmailJS

## Déploiement
```bash
# Commit + push vers GitHub → Cloudflare rebuild automatique
node push.js
node push.js "feat: description du changement"
npm run push
```

## Structure
```
├── public/           ← Output Cloudflare Pages (index.html, sw.js, assets/)
├── functions/        ← Cloudflare Pages Functions
│   ├── api/          ← Routes /api/*
│   ├── cron/         ← Jobs planifiés (expire.js, cleanup.js)
│   └── *.js          ← Fonctions racine (/push-send, /paytech-webhook…)
├── database/
│   └── migrations/   ← Scripts SQL à exécuter dans Supabase SQL Editor
├── sql/              ← Copies des migrations pour référence rapide
├── .github/
│   └── workflows/    ← GitHub Actions (cron.yml pour jobs planifiés)
├── templates/        ← Templates emails HTML
├── docs/             ← Documentation
└── push.js           ← Script git auto-commit + push
```

## Base de données — Migrations à exécuter
Ordre d'exécution dans Supabase SQL Editor :
1. `database/migrations/2026_05_20_RUN_ALL.sql`
2. `database/migrations/2026_05_27_missing_tables.sql`
3. `database/migrations/2026_05_28_retention_policies.sql`

## Crons — Déclenchement automatique
Via GitHub Actions (`.github/workflows/cron.yml`) :
- Ajouter le secret `NEXUS_CRON_TOKEN = nexus-wa-2026` dans GitHub → Settings → Secrets
- Ou déclencher manuellement via Admin → Configuration → "Nettoyer maintenant"

## Variables d'environnement (Cloudflare → Settings → Variables)
Secrets à configurer :
- `SUPABASE_SERVICE_KEY` — clé service_role Supabase
- `STRIPE_SECRET_KEY` — clé secrète Stripe
- `VAPID_PRIVATE_KEY` — clé privée VAPID (générer avec `npx web-push generate-vapid-keys`)
- `PAYTECH_API_SECRET` — secret PayTech
