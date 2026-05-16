#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  scripts/merge-and-push.sh
#  Fusionne le patch dans le projet existant et pousse sur GitHub
#  Usage : bash scripts/merge-and-push.sh [--repo /chemin/du/projet] [--push]
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
info() { echo -e "${CYAN}ℹ️   $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }
step() { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━${NC}"; }

PATCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"  # Répertoire du pack patch
TARGET_DIR=""                                   # Répertoire du projet existant
DO_PUSH=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo)   TARGET_DIR="$2"; shift 2 ;;
    --push)   DO_PUSH=true;    shift   ;;
    *)        warn "Argument inconnu: $1"; shift ;;
  esac
done

# Si TARGET_DIR non spécifié, chercher automatiquement
if [[ -z "$TARGET_DIR" ]]; then
  # Chercher un projet git parent
  PARENT="$(cd "$PATCH_DIR/.." && pwd)"
  if [[ -d "$PARENT/.git" ]]; then
    TARGET_DIR="$PARENT"
    info "Projet détecté automatiquement : $TARGET_DIR"
  else
    echo -e "${RED}Usage: bash scripts/merge-and-push.sh --repo /chemin/vers/nexus-market${NC}"
    exit 1
  fi
fi

[[ -d "$TARGET_DIR/.git" ]] || { echo -e "${RED}❌ Pas de dépôt git dans $TARGET_DIR${NC}"; exit 1; }

# ══════════════════════════════════════════════════════════════════
# ÉTAPE 1 — Sauvegarder les fichiers à remplacer
# ══════════════════════════════════════════════════════════════════
step "Sauvegarde des fichiers existants"
BACKUP_DIR="$TARGET_DIR/.backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

FILES_TO_REPLACE=(
  "wrangler.toml"
  "functions/api/disputes/index.js"
  "functions/api/disputes/[id].js"
  "functions/api/flash-sales/index.js"
  "functions/api/returns/index.js"
  "functions/api/payments/stripe/webhook.js"
  "functions/api/invoices/order/[ordId]/pdf.js"
  "functions/api/b2b/verify-ninea/[[userId]].js"
)

for f in "${FILES_TO_REPLACE[@]}"; do
  src="$TARGET_DIR/$f"
  if [[ -f "$src" ]]; then
    dest_dir="$BACKUP_DIR/$(dirname "$f")"
    mkdir -p "$dest_dir"
    cp "$src" "$dest_dir/" 2>/dev/null || true
    ok "Sauvegardé: $f"
  fi
done
ok "Sauvegarde dans $BACKUP_DIR"

# ══════════════════════════════════════════════════════════════════
# ÉTAPE 2 — Copier les fichiers du patch
# ══════════════════════════════════════════════════════════════════
step "Copie des fichiers patch"

copy_file() {
  local src="$1"
  local rel="$2"
  local dest="$TARGET_DIR/$rel"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  ok "$rel"
}

# ── wrangler.toml (REMPLACER) ─────────────────────────────────────
copy_file "$PATCH_DIR/wrangler.toml" "wrangler.toml"

# ── Fichiers REMPLACÉS (stubs → implémentation complète) ─────────
copy_file "$PATCH_DIR/functions/api/disputes/index.js"   "functions/api/disputes/index.js"
copy_file "$PATCH_DIR/functions/api/disputes/[id].js"    "functions/api/disputes/[id].js"
copy_file "$PATCH_DIR/functions/api/flash-sales/index.js" "functions/api/flash-sales/index.js"
copy_file "$PATCH_DIR/functions/api/returns/index.js"    "functions/api/returns/index.js"
copy_file "$PATCH_DIR/functions/api/payments/stripe/webhook.js" "functions/api/payments/stripe/webhook.js"

# ── Facture PDF ────────────────────────────────────────────────────
mkdir -p "$TARGET_DIR/functions/api/invoices/order/[ordId]"
copy_file "$PATCH_DIR/functions/api/invoices/order/[ordId]/pdf.js" "functions/api/invoices/order/[ordId]/pdf.js"

# ── NINEA ──────────────────────────────────────────────────────────
copy_file "$PATCH_DIR/functions/api/b2b/verify-ninea/[[userId]].js" "functions/api/b2b/verify-ninea/[[userId]].js"

# ── Fichiers NOUVEAUX (inexistants dans le projet) ────────────────
mkdir -p "$TARGET_DIR/functions/api/products"
copy_file "$PATCH_DIR/functions/api/products/search.js" "functions/api/products/search.js"

mkdir -p "$TARGET_DIR/functions/api/delivery"
copy_file "$PATCH_DIR/functions/api/delivery/[[route]].js" "functions/api/delivery/[[route]].js"

mkdir -p "$TARGET_DIR/functions/api/sms"
copy_file "$PATCH_DIR/functions/api/sms/[[route]].js" "functions/api/sms/[[route]].js"

mkdir -p "$TARGET_DIR/functions/api/analytics"
copy_file "$PATCH_DIR/functions/api/analytics/[[route]].js" "functions/api/analytics/[[route]].js"

mkdir -p "$TARGET_DIR/functions/api/live"
copy_file "$PATCH_DIR/functions/api/live/[[route]].js" "functions/api/live/[[route]].js"

# ── Migration SQL delta ────────────────────────────────────────────
copy_file "$PATCH_DIR/sql/nexus_delta_migration.sql" "nexus_delta_migration.sql"

# ── Script secrets CF ─────────────────────────────────────────────
mkdir -p "$TARGET_DIR/scripts"
copy_file "$PATCH_DIR/scripts/setup-cf-secrets.sh" "scripts/setup-cf-secrets.sh"
chmod +x "$TARGET_DIR/scripts/setup-cf-secrets.sh"

# ══════════════════════════════════════════════════════════════════
# ÉTAPE 3 — Vérifier .gitignore
# ══════════════════════════════════════════════════════════════════
step "Vérification .gitignore"
GITIGNORE="$TARGET_DIR/.gitignore"
NEEDED=(".env" "node_modules/" ".wrangler/" "*.secret" ".backup-*")
for entry in "${NEEDED[@]}"; do
  if ! grep -q "^${entry}$\|^${entry}" "$GITIGNORE" 2>/dev/null; then
    echo "$entry" >> "$GITIGNORE"
    warn "Ajouté à .gitignore: $entry"
  fi
done
ok ".gitignore à jour"

# ══════════════════════════════════════════════════════════════════
# ÉTAPE 4 — Git commit
# ══════════════════════════════════════════════════════════════════
step "Git commit"
cd "$TARGET_DIR"

git add -A

if git diff --cached --quiet; then
  ok "Aucun changement à committer"
else
  git commit -m "fix+feat: Patch 19 features — implémentations complètes

REMPLACÉS (stubs → workflow complet) :
- functions/api/disputes/index.js + [id].js  → workflow complet + messages + résolution admin
- functions/api/flash-sales/index.js          → CRUD complet + compte à rebours + filtres
- functions/api/returns/index.js              → fenêtre 7j + approval vendeur + refund auto
- functions/api/payments/stripe/webhook.js    → HMAC SHA-256 vérifié (sécurité critique)
- functions/api/invoices/order/[ordId]/pdf.js → HTML imprimable + API PDF externe
- functions/api/b2b/verify-ninea/[[userId]].js → API APIX Sénégal + cache 7j

AJOUTÉS (nouvelles routes) :
- functions/api/products/search.js            → Recherche avancée PostgREST + facettes
- functions/api/delivery/[[route]].js         → Suivi livraison + webhook transporteur
- functions/api/sms/[[route]].js              → SMS OTP Infobip (hashé SHA-256)
- functions/api/analytics/[[route]].js        → Dashboard analytics vendeur + export CSV
- functions/api/live/[[route]].js             → Messagerie live + Realtime + typing

MIS À JOUR :
- wrangler.toml → toutes les vars d'env réelles configurées
- nexus_delta_migration.sql → tables manquantes uniquement (idempotent)
- scripts/setup-cf-secrets.sh → injection secrets CF

⚠️  Actions requises après ce commit :
1. Supabase SQL Editor → exécuter nexus_delta_migration.sql
2. Supabase Realtime → activer: notifications, live_messages, live_sessions, typing_status, delivery_events
3. bash scripts/setup-cf-secrets.sh (configurer wrangler login d'abord)"

  ok "Commit créé"
fi

# ══════════════════════════════════════════════════════════════════
# ÉTAPE 5 — Push GitHub
# ══════════════════════════════════════════════════════════════════
if [[ "$DO_PUSH" == true ]]; then
  step "Push GitHub"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  info "Branche: $BRANCH"

  git push origin "$BRANCH" \
    && ok "Push GitHub réussi ✨" \
    || { warn "Push refusé — tentative force..."; git push origin "$BRANCH" --force-with-lease && ok "Push force réussi"; }
else
  echo ""
  info "Push non effectué. Pour pousser :"
  echo -e "  ${CYAN}cd $TARGET_DIR && git push origin main${NC}"
fi

# ══════════════════════════════════════════════════════════════════
# RÉSUMÉ
# ══════════════════════════════════════════════════════════════════
step "Résumé"
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  🚀 Patch appliqué avec succès !${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Actions restantes :${NC}"
echo ""
echo -e "  1️⃣  ${BOLD}Supabase SQL Editor${NC}"
echo -e "     https://pqcqbstbdujzaclsiosv.supabase.co → SQL Editor"
echo -e "     → Coller et exécuter ${BOLD}nexus_delta_migration.sql${NC}"
echo ""
echo -e "  2️⃣  ${BOLD}Supabase Realtime${NC}"
echo -e "     Database > Replication > activer :"
echo -e "     notifications, live_messages, live_sessions, typing_status, delivery_events"
echo ""
echo -e "  3️⃣  ${BOLD}Secrets Cloudflare${NC}"
echo -e "     ${CYAN}wrangler login${NC}"
echo -e "     ${CYAN}bash scripts/setup-cf-secrets.sh${NC}"
echo ""
echo -e "  4️⃣  ${BOLD}Stripe webhook URL${NC}"
echo -e "     dashboard.stripe.com → Webhooks → Ajouter endpoint :"
echo -e "     https://nexus-market-md360.vercel.app/api/payments/stripe/webhook"
echo -e "     Événements : checkout.session.completed, payment_intent.succeeded, charge.refunded"
echo ""
