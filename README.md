# NEXUS Market — Phase 1 (Bloquants prod & Sécurité critique)

Ce paquet contient toutes les corrections de la **Phase 1** du plan d'action.

## Contenu

```
nexus-phase1/
├── install.sh              ← Script d'installation + push GitHub automatique
├── index.html              ← Frontend corrigé (1.5 Mo, -262 lignes, -210 ko)
├── sw.js                   ← Service Worker (offline, cache assets)
├── _headers                ← Headers sécurité Cloudflare (CSP, HSTS, etc.)
└── functions/api/
    ├── ping.js                              ← GET — test si Functions actif
    ├── health.js                            ← GET — health check (utilisé par frontend)
    ├── sms/send.js                          ← POST — SMS Twilio / Orange
    ├── auth/refresh.js                      ← POST — refresh JWT Supabase
    ├── upload/index.js                      ← POST — proxy imgBB sécurisé
    └── payments/paytech/
        ├── init.js                          ← POST — init paiement
        ├── ipn.js                           ← POST — webhook PayTech
        └── verify/[orderId].js              ← GET — vérifier statut commande
```

## Installation rapide

```bash
# 1. Télécharge et extrais ce paquet à côté de ton dépôt
unzip nexus-phase1.zip

# 2. Va dans ton dépôt git local NEXUS
cd /chemin/vers/ton-depot

# 3. Lance le script (il va copier, commiter et pusher)
bash ../nexus-phase1/install.sh
```

Le script :
1. ✅ Vérifie que tu es dans un dépôt git
2. ✅ Sauvegarde ton ancien `index.html` (`.before-phase1.<timestamp>`)
3. ✅ Copie tous les fichiers
4. ✅ Affiche `git status` pour vérification
5. ✅ Te demande confirmation avant de pusher
6. ✅ Commit + push avec un message détaillé
7. ✅ Affiche les variables d'env à configurer sur Cloudflare

## Que corrige cette Phase 1 ?

### Bloquants production
- **Duplication CSS/JS supprimée** (`nexus-nav-patch-v2` × 2 → 1) : −262 lignes
- **Favicon base64 triplé** (216 ko) → SVG inline de 200 octets
- **OG image cassé** (base64 invalide pour FB/Twitter) → URL placehold.co
- **74 routes /api/* manquantes** → 8 routes critiques créées
- **Sessions qui cassent à 15 min** → `/api/auth/refresh` opérationnel

### Sécurité
- **Sentry désactivé** → stub avec capture dans `window.__nexusErrors`
- **187 console.log en prod** → silencieux sauf en debug
- **Pas de CSP** → headers stricts dans `_headers`
- **Clé imgBB exposée** → proxy via `/api/upload`

## Après installation : à faire absolument

### 1. Variables d'environnement Cloudflare

Dashboard Pages → ton projet → Settings → Environment variables

| Variable | Production | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ Requis | `https://pqcqbstbdujzaclsiosv.supabase.co` |
| `SUPABASE_SERVICE_KEY` | ✅ Requis | Service role key Supabase |
| `SUPABASE_ANON_KEY` | ✅ Requis | Anon key (même que dans index.html) |
| `PAYTECH_API_KEY` | ✅ Requis | **Régénérer** sur paytech.sn |
| `PAYTECH_API_SECRET` | ✅ Requis | **Régénérer** aussi |
| `PAYTECH_ENV` | ✅ Requis | `test` au début, `prod` ensuite |
| `SMS_PROVIDER` | ✅ Requis | `simulate`, `twilio`, ou `orange` |
| `IMGBB_API_KEY` | ✅ Requis | **Régénérer** sur imgbb.com |
| `TWILIO_SID/TOKEN/FROM` | si twilio | |
| `ORANGE_CLIENT_ID/SECRET/SENDER_ADDR` | si orange | |

### 2. Test après déploiement

```bash
# Doit retourner du JSON (pas du HTML)
curl https://5d15ae2f.nexus-market-asb.pages.dev/api/ping
curl https://5d15ae2f.nexus-market-asb.pages.dev/api/health
```

### 3. Audit RLS Supabase

Dans le SQL Editor Supabase :

```sql
-- Tables sans RLS active (à corriger)
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- Tables avec RLS mais sans policy (bloquées totalement)
SELECT t.tablename FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname
  AND p.tablename = t.tablename
WHERE t.schemaname = 'public' AND t.rowsecurity = true
  AND p.policyname IS NULL;
```

### 4. Régénérer les clés compromises

Les clés suivantes étaient en clair dans Git (historique) ou dans le HTML :
- **PayTech** : dashboard PayTech → API → Régénérer
- **imgBB** : imgbb.com → Profile → Generate new API key

Pour purger l'historique git :
```bash
brew install git-filter-repo  # ou pip install git-filter-repo
# Sauvegarde d'abord !
git filter-repo --replace-text <(echo "<ancienne_cle>==>***REVOKED***")
```

## Phase 2 (suivante)

Une fois la Phase 1 stable, je proposerai :
- Refactor `AdminDashboard` (1394 lignes → sous-composants)
- Migration JWT → cookies HttpOnly
- Tests Playwright sur le flow checkout
- Events GA4 e-commerce (`purchase`, `add_to_cart`)
- i18n (FR / EN / Wolof)
- Migration vers Vite + code splitting (−60% bytes sur first load)
