# NEXUS Market — Checklist de configuration

> Tout le **code** est déployé sur `main` (Cloudflare Pages → `nexus-market-asb.pages.dev`).
> Cette checklist couvre les **réglages externes** restants (base de données, variables,
> services tiers) pour activer pleinement les fonctionnalités de la session.
>
> Légende : ✅ fait dans le code · ⏳ action manuelle requise · 🔒 secret (ne jamais committer)

---

## 1. Supabase — exécuter les migrations (SQL Editor)

Ouvrir **Supabase → SQL Editor**, coller-exécuter chaque fichier (présents dans le repo sous
`sql/` **et** `database/migrations/`). Tous sont **idempotents** (rejouables sans risque).

Ordre recommandé :

- [ ] `2026_06_03_payout_requests_align.sql` — colonnes payouts (corrige les retraits)
- [ ] `2026_06_03_rate_limits.sql` — table de rate-limiting
- [ ] `2026_06_07_drop_refresh_tokens.sql` — nettoyage table inutilisée
- [ ] `2026_06_07_api_keys.sql` — clés API + RPC `api_key_validate` (flux Merchant/Pro)
- [ ] `2026_06_07_db_usage.sql` — RPC `db_usage` (monitoring quota)
- [ ] `2026_06_07_delivery_proof.sql` — preuve de livraison (#13)
- [ ] `2026_06_07_wa_tracking.sql` — option suivi WhatsApp (#15)
- [ ] `2026_06_07_troc.sql` — tables NEXUS Troc + RLS
- [ ] `2026_06_07_troc_admin.sql` — RLS modération admin Troc
- [ ] `2026_06_07_stories.sql` — table NEXUS Stories + RLS (vidéo)

> ℹ️ Vérifier après coup : `select * from pg_policies where tablename in ('troc_listings','stories');`

---

## 2. Cloudflare Pages — variables d'environnement

**Pages → nexus-market → Settings → Variables and Secrets → Production** (puis *Preview* si besoin).
Après ajout de secrets, **re-déployer** (un nouveau build prend les variables en compte).

### Déjà nécessaires (probablement en place)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_KEY` 🔒
- [ ] `SITE_URL` = `https://nexus-market-asb.pages.dev`

### Paiements / commission
- [ ] `NEXUS_COMMISSION` = `0` (phase de lancement ; passer à `0.05` → `0.10` → `0.15` ensuite)
- [ ] `REQUIRE_DELIVERY_PHOTO` = `true` *(optionnel — n'active le blocage des fonds escrow qu'avec preuve photo ; laisser absent = désactivé)*

### Admin / cron
- [ ] `ADMIN_USER_ID` = *(UUID du profil admin — notifications internes : retraits, quota DB)*
- [ ] `CRON_SECRET` 🔒 = *(token pour déclencher `/cron/*` ; sinon repli `NEXUS_WA_SECRET`)*

### NEXUS Stories — Mux (voir §3)
- [ ] `MUX_TOKEN_ID`
- [ ] `MUX_TOKEN_SECRET` 🔒
- [ ] `MUX_WEBHOOK_SECRET` 🔒

### Monitoring quota Supabase (optionnel)
- [ ] `DB_LIMIT_MB` = `500` *(tier gratuit)* · `DB_ALERT_PCT` = `70`

### IndexNow (optionnel — déjà fonctionnel sans)
- [ ] `INDEXNOW_KEY` *(par défaut codée + fichier `public/6ae048af183b76c8b2a7e54acc1681c7.txt`)*
- [ ] `INDEXNOW_ADMIN_TOKEN` 🔒 *(protège le POST /api/indexnow ; optionnel)*

### Markup logistique #16 (optionnel)
- [ ] `SHIPPING_API_URL`, `SHIPPING_API_KEY` 🔒, `SHIPPING_MARGIN_FCFA` *(sinon grille interne)*

---

## 3. Mux.com — pipeline vidéo (NEXUS Stories)

1. Créer un compte sur **mux.com**.
2. **Settings → Access Tokens → Generate new token**
   - Permissions : **Mux Video** (Read + Write).
   - [ ] Copier l'**ID** → `MUX_TOKEN_ID` (Cloudflare)
   - [ ] Copier le **Secret** 🔒 → `MUX_TOKEN_SECRET` (Cloudflare)
3. **Settings → Webhooks → Create new webhook**
   - URL : `https://nexus-market-asb.pages.dev/api/webhooks/mux`
   - [ ] Copier le **Signing Secret** 🔒 → `MUX_WEBHOOK_SECRET` (Cloudflare)
4. **Mux Data → Environment Key** *(analytics)*
   - [x] Déjà intégrée dans le code : `3l6gnsub9mk0si2j22gt2ospm` (clé publique). ✅

> Test de bout en bout : ouvrir le widget **🎬 Stories** (connecté en vendeur) → « ＋ Publier »
> → choisir une vidéo 15–60s. Après ~1 min, elle apparaît (webhook `video.asset.ready`).

---

## 4. Cron externe (cron-job.org ou équivalent)

Cloudflare Pages ne supporte pas les cron natifs → déclencher par HTTP GET (remplacer le token).

- [ ] **Horaire** : `GET https://nexus-market-asb.pages.dev/cron/expire?token=<CRON_SECRET>`
      *(expire boosts + annonces express + 🔄 Troc + 🎬 Stories)*
- [ ] **Quotidien** : `GET https://nexus-market-asb.pages.dev/cron/db-usage?token=<CRON_SECRET>`
      *(alerte quota Supabase > 70 %)*
- [ ] **Hebdo (dimanche)** : `GET https://nexus-market-asb.pages.dev/cron/cleanup?token=<CRON_SECRET>`
      *(purge notifications/logs anciens)*

---

## 5. Analytics & SEO

- [ ] **Plausible** : créer la propriété `nexus-market-asb.pages.dev` sur plausible.io
      *(le script est déjà dans `index.html`)*. Self-host possible → changer le `src`.
- [ ] **Sentry** *(optionnel)* : coller le DSN dans `<meta name="sentry-dsn" content="">` (`public/index.html`).
- [x] **IndexNow** : fichier-clé déjà servi ; ping auto à la publication. ✅
- [x] **Google Search Console** : balise de vérification déjà présente. ✅
- [ ] **Soumettre le sitemap** dans Search Console : `https://nexus-market-asb.pages.dev/sitemap_index.xml`
- [x] **og-image** : `public/og-image.png` créé. ✅

---

## 6. Vérification post-configuration

- [ ] `/troc` et `/stories` affichent du contenu (après publication d'un troc / d'une vidéo).
- [ ] `/api/products-feed?key=<clé>` répond *(générer une clé via l'exemple SQL en bas de `api_keys.sql`)*.
- [ ] Dashboard **Admin → 🔄 Troc** et **🎬 Stories** listent et modèrent.
- [ ] Un nouveau vendeur peut se connecter immédiatement (accès provisoire 72h) puis est bloqué après.
- [ ] Mux Dashboard → **Data** : les vues remontent quand on regarde une story.
- [ ] `sitemap-listings.xml` contient produits + annonces + trocs + stories.

---

## 7. Rappels de sécurité

- 🔒 Ne jamais committer : `SUPABASE_SERVICE_KEY`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`,
  `CRON_SECRET`, clés PayTech/Stripe. Toujours via **Secrets** Cloudflare.
- 🔑 Le **PAT GitHub** partagé pendant le développement doit être **révoqué**
  (GitHub → Settings → Developer settings → Tokens).
- La clé **Mux Data Environment Key** est *publique* (analytics) — pas un secret.

---

*Généré pour NEXUS Market — dernière mise à jour : 2026-06-07.*
