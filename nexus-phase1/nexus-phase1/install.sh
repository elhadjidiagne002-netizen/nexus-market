#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  NEXUS Market — Script d'installation Phase 1
# ───────────────────────────────────────────────────────────────────────────
#  Ce script :
#    1. Copie les fichiers Phase 1 dans ton dépôt local
#    2. Te montre les changements (git diff)
#    3. Demande confirmation
#    4. Commit + push vers GitHub
#    5. Affiche les prochaines étapes (variables d'env Cloudflare)
#
#  Usage :
#    cd /chemin/vers/ton-depot-nexus
#    bash install.sh
#
#  Prérequis :
#    - Le script doit être exécuté à la racine du dépôt git (où vit index.html)
#    - Le dossier extrait du zip "nexus-phase1/" doit être à côté
#    - git, bash 4+, et idéalement gh CLI (optionnel)
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Quitter en cas d'erreur

# ── Couleurs pour la lisibilité ───────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ───────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
ok()      { echo -e "${GREEN}✓${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
err()     { echo -e "${RED}✗${NC}  $1" >&2; }
title()   { echo -e "\n${BOLD}${BLUE}═══ $1 ═══${NC}\n"; }

# ── Détection du dossier source ───────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
SRC_DIR="$SCRIPT_DIR/nexus-phase1"

if [ ! -d "$SRC_DIR" ]; then
  # Si le script est lancé depuis l'intérieur du dossier nexus-phase1
  if [ -f "$SCRIPT_DIR/index.html" ] && [ -d "$SCRIPT_DIR/functions" ]; then
    SRC_DIR="$SCRIPT_DIR"
  else
    err "Dossier 'nexus-phase1/' introuvable à côté du script."
    err "Place install.sh au même niveau que le dossier nexus-phase1/"
    exit 1
  fi
fi

# ── Vérification que pwd est bien un dépôt git ────────────────────────────
title "Vérification du dépôt"

if [ ! -d ".git" ]; then
  err "Pas de dépôt git détecté dans $(pwd)"
  err "Lance ce script depuis la racine de ton dépôt NEXUS Market."
  exit 1
fi
ok "Dépôt git détecté : $(pwd)"

REPO_NAME=$(basename "$(pwd)")
CURRENT_BRANCH=$(git branch --show-current)
info "Branche actuelle : $CURRENT_BRANCH"

# Vérifier qu'il n'y a pas de changements non-commités
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  warn "Tu as des changements non-commités dans ton dépôt."
  echo ""
  git status --short
  echo ""
  read -p "Continuer quand même ? Ces changements seront mélangés avec ceux de Phase 1. (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Abandon. Commit ou stash tes changements avant de relancer."
    exit 0
  fi
fi

# ── Sauvegarde de l'ancien index.html ─────────────────────────────────────
title "Sauvegarde"

if [ -f "index.html" ]; then
  BACKUP_NAME="index.html.before-phase1.$(date +%Y%m%d-%H%M%S)"
  cp index.html "$BACKUP_NAME"
  ok "Backup créé : $BACKUP_NAME"
else
  warn "Aucun index.html existant — c'est une nouvelle installation"
fi

# ── Copie des fichiers ────────────────────────────────────────────────────
title "Copie des fichiers Phase 1"

# 1. index.html
cp "$SRC_DIR/index.html" ./index.html
ok "index.html mis à jour ($(wc -l < index.html) lignes, $(du -h index.html | cut -f1))"

# 2. Service Worker
cp "$SRC_DIR/sw.js" ./sw.js
ok "sw.js installé"

# 3. _headers (sécurité)
cp "$SRC_DIR/_headers" ./_headers
ok "_headers installé (CSP + HSTS + X-Frame-Options)"

# 4. Functions Cloudflare Pages
mkdir -p functions/api/payments/paytech/verify
mkdir -p functions/api/sms
mkdir -p functions/api/auth
mkdir -p functions/api/upload

cp "$SRC_DIR/functions/api/ping.js"                                   functions/api/ping.js
cp "$SRC_DIR/functions/api/health.js"                                 functions/api/health.js
cp "$SRC_DIR/functions/api/sms/send.js"                               functions/api/sms/send.js
cp "$SRC_DIR/functions/api/auth/refresh.js"                           functions/api/auth/refresh.js
cp "$SRC_DIR/functions/api/upload/index.js"                           functions/api/upload/index.js
cp "$SRC_DIR/functions/api/payments/paytech/init.js"                  functions/api/payments/paytech/init.js
cp "$SRC_DIR/functions/api/payments/paytech/ipn.js"                   functions/api/payments/paytech/ipn.js
cp "$SRC_DIR/functions/api/payments/paytech/verify/[orderId].js"      functions/api/payments/paytech/verify/[orderId].js

ok "8 Cloudflare Pages Functions installées"

# ── Récapitulatif ─────────────────────────────────────────────────────────
title "Récapitulatif des changements"

git status --short

# ── Demande de confirmation ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}Corrections Phase 1 appliquées :${NC}"
echo "  • Duplication nexus-nav-patch-v2 supprimée (-262 lignes)"
echo "  • Favicon base64 (216 ko) → SVG inline (200 octets)"
echo "  • OG image base64 → URL placehold.co (vraies previews sociales)"
echo "  • Sentry stub + capture d'erreurs centralisée (window.__nexusErrors)"
echo "  • Wrapper console.log (silencieux en prod)"
echo "  • 8 Cloudflare Pages Functions :"
echo "      - /api/ping, /api/health (tests)"
echo "      - /api/payments/paytech/{init,verify,ipn}"
echo "      - /api/sms/send (Twilio + Orange)"
echo "      - /api/auth/refresh (sessions ne cassent plus à 15 min)"
echo "      - /api/upload (proxy imgBB sécurisé)"
echo "  • Service Worker /sw.js (mode hors ligne basique)"
echo "  • Headers CSP, HSTS, X-Frame-Options dans _headers"
echo ""

read -p "Commiter et pusher ces changements sur GitHub ? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  info "Changements appliqués localement mais NON commités."
  info "Tu peux vérifier avec :  git diff"
  info "Puis commiter manuellement :"
  echo "   git add ."
  echo "   git commit -m 'NEXUS Phase 1 corrections'"
  echo "   git push"
  exit 0
fi

# ── Commit + push ─────────────────────────────────────────────────────────
title "Commit & Push"

git add .

# Commit avec message multi-lignes
git commit -m "NEXUS Market — Phase 1 corrections

- Remove nexus-nav-patch-v2 duplicate (-262 lines, fixes DOM ID collision)
- Replace 3× triplicated base64 favicon (~216KB) with inline SVG (200 bytes)
- Replace broken og:image base64 with placehold.co URL (real social previews now work)
- Centralize error capture: window.Sentry stub + window.__nexusErrors queue
- Silence console.log in production (debug flag for localhost/preview only)
- Add 8 Cloudflare Pages Functions:
    /api/ping, /api/health (test endpoints)
    /api/payments/paytech/{init,verify/:id,ipn} (PayTech integration)
    /api/sms/send (Twilio + Orange SMS providers)
    /api/auth/refresh (extend JWT sessions beyond 15min)
    /api/upload (imgBB proxy — hides API key)
- Add /sw.js Service Worker (basic offline support)
- Add _headers with strict CSP, HSTS, X-Frame-Options

Refs: Phase 1 of NEXUS production hardening plan"

ok "Commit créé"

# Push
info "Push vers origin/$CURRENT_BRANCH..."
if git push origin "$CURRENT_BRANCH"; then
  ok "Push réussi !"
else
  err "Push échoué. Tu peux retenter manuellement :  git push"
  exit 1
fi

# ── Prochaines étapes ─────────────────────────────────────────────────────
title "🎉 Phase 1 déployée — Prochaines étapes"

cat <<EOF
${BOLD}1. Configurer les variables d'environnement Cloudflare Pages${NC}
   Dashboard Cloudflare → ton projet Pages → Settings → Environment variables

   ${YELLOW}Production${NC} (au minimum) :
     SUPABASE_URL              = https://pqcqbstbdujzaclsiosv.supabase.co
     SUPABASE_SERVICE_KEY      = <ta clé service_role Supabase>
     SUPABASE_ANON_KEY         = <même clé que dans index.html ligne 1401>
     PAYTECH_API_KEY           = <régénérer sur paytech.sn — ANCIENNE COMPROMISE>
     PAYTECH_API_SECRET        = <régénérer aussi>
     PAYTECH_ENV               = test     (puis "prod" plus tard)
     SMS_PROVIDER              = simulate (puis "twilio" ou "orange")
     IMGBB_API_KEY             = <régénérer sur imgbb.com — ANCIENNE COMPROMISE>

   ${YELLOW}Pour Twilio${NC} (si SMS_PROVIDER=twilio) :
     TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM

   ${YELLOW}Pour Orange SMS API${NC} (si SMS_PROVIDER=orange) :
     ORANGE_CLIENT_ID, ORANGE_CLIENT_SECRET, ORANGE_SENDER_ADDR

${BOLD}2. Tester que Pages Functions est bien actif${NC}
   Une fois le déploiement terminé (~30s après le push), visite :
     https://5d15ae2f.nexus-market-asb.pages.dev/api/ping

   Tu dois voir du JSON : { "ok": true, ... }
   Si tu vois du HTML, Pages Functions n'est pas activé (rare).

${BOLD}3. Auditer la RLS Supabase${NC} (priorité critique)
   Dashboard Supabase → SQL Editor → exécute :

     -- Tables sans RLS active (DANGER si data sensible)
     SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND rowsecurity = false;

     -- Tables avec RLS mais sans aucune policy (= bloquées)
     SELECT t.tablename FROM pg_tables t
     LEFT JOIN pg_policies p ON p.schemaname = t.schemaname
       AND p.tablename = t.tablename
     WHERE t.schemaname = 'public' AND t.rowsecurity = true
       AND p.policyname IS NULL;

${BOLD}4. Régénérer les clés compromises${NC}
   - PayTech : Dashboard PayTech → API → Régénérer apiKey + secretKey
   - imgBB   : https://imgbb.com → Profile → Generate new API key
   - Purger l'historique git :
       brew install git-filter-repo   # ou pip install git-filter-repo
       git filter-repo --invert-paths --path index.html.old-with-keys

${BOLD}5. Une fois tout vérifié, on peut attaquer la Phase 2${NC}
   Phase 2 : refactor AdminDashboard, migration TypeScript, tests Playwright,
   migration JWT → HttpOnly cookies, GA4 events e-commerce.

EOF

ok "Tout est prêt. Bonne chance ! 🚀"
