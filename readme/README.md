# NEXUS Market — Phase 3 (Hardening continued)

Cette phase complète le durcissement sécurité de la Phase 2, en gardant ton workflow monolithique actuel (édition directe d'`index.html`).

## Contenu du paquet

```
nexus-phase3/
├── install.ps1                              ← Script Windows PowerShell
├── install.sh                               ← Script Mac/Linux/Git Bash
├── README.md                                ← Ce fichier
├── index.html                               ← Frontend modifié (1.54 Mo)
├── functions/api/email/send.js              ← Nouvelle route proxy email
├── playwright.config.js                     ← Config tests E2E (optionnel)
├── package.json                             ← Pour npm install Playwright
├── tests/checkout.spec.js                   ← 5 tests E2E
└── SUPABASE_RLS_AUDIT_PHASE3.sql            ← Audit policies à exécuter dans Supabase
```

## Installation

```powershell
# Windows
cd C:\Users\pheni\Downloads\nexus-market
powershell -ExecutionPolicy Bypass -File ..\nexus-phase3\install.ps1
```

```bash
# macOS/Linux/Git Bash
cd ~/nexus-market
bash ../nexus-phase3/install.sh
```

Le script demande si tu veux installer les tests Playwright (optionnel) — réponds `y` seulement si tu prévois de les utiliser.

## Corrections appliquées

### 1. Proxy email serveur (`/api/email/send`)

**Problème** : La clé publique EmailJS était dans le HTML. Un attaquant pouvait spammer ton quota EmailJS gratuit (200 emails/mois).

**Correction** : Nouvelle Cloudflare Function `/api/email/send` qui :
- Vérifie le JWT Bearer dans l'Authorization header (auth obligatoire)
- Applique un rate limit serveur (1 email/30s par destinataire)
- Supporte 3 providers via la variable `EMAIL_PROVIDER` :
  - `resend` (recommandé, 100 emails/jour gratuit)
  - `emailjs` (server-side via leur REST API, ne révèle pas la clé)
  - `simulate` (log seulement, pour dev/preview)

**Côté frontend** : `EmailService.send()` essaie d'abord `/api/email/send` quand le backend est ready et qu'un JWT est disponible. Si le backend répond OK, on n'utilise pas EmailJS direct du tout — la clé n'est donc pas utilisée.

**Fallback préservé** : si le backend est KO (offline, 5xx), on tombe sur EmailJS direct comme avant — l'app continue de fonctionner.

### 2. Tests E2E Playwright (optionnel)

5 tests dans `tests/checkout.spec.js` :
1. Homepage charge sans erreur JS critique
2. Catalogue affiche au moins 1 produit
3. `/api/ping` retourne du JSON (Functions actif)
4. GA4 `add_to_cart` se déclenche au clic
5. Validation NINEA rejette les formats invalides

Plus un smoke test qui vérifie que les markers Phase 1+2 sont présents dans le HTML déployé en prod (`__nexusErrors`, favicon SVG, `trackViewItem`, `validateNinea`, etc.).

**Lancer les tests** :
```bash
npm install
npx playwright install chromium
npx playwright test                # mode CI
npx playwright test --headed       # mode debug visible
npx playwright test --ui           # interface graphique interactive
NEXUS_BASE_URL=http://localhost:5500 npx playwright test    # contre serveur local
```

### 3. Audit RLS consolidation (manuel)

Le fichier `SUPABASE_RLS_AUDIT_PHASE3.sql` contient 5 requêtes d'analyse pour les tables surchargées de policies (`messages` 18, `products` 16, `profiles` 14, `loyalty_points` 13).

Le script ne supprime rien automatiquement — c'est un outil de revue. Tu décides ce qu'il faut consolider après lecture des résultats.

## Variables d'environnement à ajouter

Sur Cloudflare Pages Settings → Environment variables :

**Option A : Resend (recommandé)**
```
EMAIL_PROVIDER       = resend
RESEND_API_KEY       = re_...     (créer un compte gratuit sur resend.com)
EMAIL_FROM           = NEXUS Market <no-reply@nexus.sn>
```

**Option B : EmailJS server-side (garde tes templates existants)**
```
EMAIL_PROVIDER       = emailjs
EMAILJS_SERVICE_ID   = service_84yfkgf
EMAILJS_TEMPLATE_ID  = template_t075pts
EMAILJS_PUBLIC_KEY   = WSBntSTWdh5d9usZC
EMAILJS_PRIVATE_KEY  = (optionnel, pour signer les requêtes)
```

**Option C : Simulation (dev/preview)**
```
EMAIL_PROVIDER       = simulate
```

## Test post-déploiement

Après que Cloudflare a redéployé :

```bash
# 1. Le endpoint répond bien
curl https://5d15ae2f.nexus-market-asb.pages.dev/api/email/send \
  -X POST \
  -H "Authorization: Bearer FAKE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","html":"<p>Hello</p>"}'

# → Doit retourner 401 (FAKE_TOKEN refusé) ou 503 (provider non configuré)
# → Si ça retourne du HTML, Functions n'est pas actif
```

Dans la console DevTools sur ton site :

```javascript
// Vérifier que le frontend appelle bien le backend
window.EmailService.send({
  to: 'test@example.com',
  subject: 'Test',
  variables: { html_body: '<p>Test</p>' }
});
// → Network tab : tu dois voir POST /api/email/send (pas un appel direct à emailjs.com)
```

## Ce qui n'a PAS été fait en Phase 3

Pour rester safe en mode monolithique :

- **JWT → cookies HttpOnly** : 115 endroits à refactorer dans `index.html`, risque élevé de tout casser. À faire en Phase 4 si tu passes à Vite.
- **Refactor AdminDashboard (2665 lignes)** : sans build system, l'extraction de sous-composants n'apporte pas grand-chose. Reporté à la Phase 4.
- **Code splitting / lazy load** : impossible sans Vite/Webpack.

## État global du projet (après Phases 1+2+3)

**Sécurité** ✅
- 5 routes critiques API (PayTech, SMS, auth/refresh, upload, email)
- 23 tables Supabase protégées par RLS
- Headers CSP/HSTS/X-Frame-Options
- Rate limits frontend ET serveur sur les emails
- Capture d'erreurs centralisée
- Clés sensibles déplacées en env vars serveur

**Performance** ✅
- −210 ko (favicon optimisé)
- −262 lignes (duplications supprimées)
- Polling intelligent (pause si backend KO)
- Service Worker actif

**Business** ✅
- Funnel GA4 complet (view → add_to_cart → checkout → purchase)
- Validation NINEA/RCCM
- Sessions JWT longue durée (refresh côté serveur)

**Qualité** ✅
- 5 tests Playwright sur les chemins critiques (optionnel)
- Script SQL d'audit RLS

## Phase 4 possible (si tu veux passer à Vite plus tard)

Quand tu seras prêt à installer Node.js et apprendre `npm run build` :

1. Migration vers Vite (1 jour de setup) → first-load ÷ 3
2. Refactor AdminDashboard (2-3 jours)
3. JWT cookies HttpOnly (1-2 jours, élimine le risque XSS sur le token)
4. TypeScript progressif via JSDoc (3-4 jours)
5. i18n FR/EN/Wolof complet (1 semaine, l'infrastructure existe déjà)

Mais ce n'est pas urgent : ton app actuelle est solide et sécurisée.
