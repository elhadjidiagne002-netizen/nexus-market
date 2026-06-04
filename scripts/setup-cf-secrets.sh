#!/usr/bin/env bash
# ============================================================================
# Pousse les secrets Cloudflare PAGES depuis le fichier .env LOCAL (jamais commité).
# AUCUNE valeur en dur ici (l'ancienne version contenait des secrets en clair).
#
# Prérequis :
#   1. npm i -g wrangler && wrangler login
#   2. Renseigner les valeurs ROTÉES dans .env (cf. .env.example)
# Usage : bash scripts/setup-cf-secrets.sh
# ============================================================================
set -euo pipefail
PROJECT="nexus-market"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

command -v wrangler &>/dev/null || { echo "wrangler absent : npm i -g wrangler && wrangler login"; exit 1; }

ENV_FILE="$(dirname "$0")/../.env"
[[ -f "$ENV_FILE" ]] || { echo "Fichier .env introuvable : $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a

# Seuls les SECRETS sont poussés ici. Les variables PUBLIQUES (URLs, clés
# publishable, VAPID_PUBLIC_KEY...) restent dans wrangler.toml [vars].
SECRETS=(
  SUPABASE_SERVICE_KEY
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
  PAYTECH_API_KEY PAYTECH_API_SECRET
  RESEND_API_KEY GROQ_API_KEY
  VAPID_PRIVATE_KEY
  GREEN_API_TOKEN NEXUS_WA_SECRET
  INTERNAL_API_KEY DELIVERY_WEBHOOK_SECRET
  CRON_SECRET ADMIN_USER_ID
  SMTP_PASS
)

echo -e "\n🔐  Injection des secrets Cloudflare Pages ($PROJECT)...\n"
for name in "${SECRETS[@]}"; do
  val="${!name:-}"
  if [[ -z "$val" ]]; then
    echo -e "${YELLOW}  SKIP (absent du .env) : $name${NC}"
    continue
  fi
  if printf '%s' "$val" | wrangler pages secret put "$name" --project-name "$PROJECT" >/dev/null 2>&1; then
    echo -e "${GREEN}  OK   $name${NC}"
  else
    echo -e "${RED}  FAIL $name${NC}"
  fi
done
echo -e "\n${GREEN}✨ Terminé. Vérifier : CF Dashboard > Workers & Pages > $PROJECT > Settings > Variables${NC}\n"
