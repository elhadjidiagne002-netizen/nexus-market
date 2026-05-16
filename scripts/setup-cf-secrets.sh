#!/usr/bin/env bash
# Injection des secrets Cloudflare Workers depuis le .env
# Usage : wrangler login && bash scripts/setup-cf-secrets.sh
set -euo pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }

command -v wrangler &>/dev/null || { echo "❌ wrangler non installé. Exécuter: npm install -g wrangler && wrangler login"; exit 1; }

ENV_FILE="$(dirname "$0")/../.env"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; ok ".env chargé"; }

push() {
  local name="$1"; local val="${2:-}"
  [[ -z "$val" ]] && { warn "IGNORÉ (vide): $name"; return; }
  echo "$val" | wrangler secret put "$name" 2>/dev/null && ok "$name" || warn "ÉCHEC: $name"
}

echo -e "\n🔐  Injection secrets Cloudflare...\n"

push "SUPABASE_SERVICE_KEY"    "${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzQ5MiwiZXhwIjoyMDkwMzg5NDkyfQ.fBlPt4g40xZ5F3lbempAYNuLZtvcnwxshnipACZPy08}"
push "SUPABASE_SERVICE_ROLE_KEY" "${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzQ5MiwiZXhwIjoyMDkwMzg5NDkyfQ.fBlPt4g40xZ5F3lbempAYNuLZtvcnwxshnipACZPy08}"
push "JWT_SECRET"               "${JWT_SECRET:-32b7d9b81f59004dbb00efde2a1956bda5886742aaa1dca83506de503db1b34c}"
push "REFRESH_TOKEN_SECRET"     "${REFRESH_TOKEN_SECRET:-bf2697e53a4c9dd2dd200e76c0241b9d221c5a1fc720c86999502f877e1c863ef}"
push "STRIPE_SECRET_KEY"        "${STRIPE_SECRET_KEY:-sk_test_51TGdXe1H2qyHRVYhe7XAk8L4W0KuGOA46QsyVfbekSYd9O3dExf7R7ODZo21DWd7G6HNuL7V5OVAilIj3H0GUYfS00xaayPhVe}"
push "STRIPE_WEBHOOK_SECRET"    "${STRIPE_WEBHOOK_SECRET:-whsec_Xlt4nDaTfXw0MVWKwcee5ljjJLP4QDl8}"
push "SMTP_PASS"                "${SMTP_PASS:-lokaasorlefafaze}"
push "VAPID_PRIVATE_KEY"        "${VAPID_PRIVATE_KEY:-c_sPmJ7KJzVW4ZGIheVHPiCF8fq5lBF09-tH96vRSH0}"
push "VAPID_SUBJECT"            "mailto:elhadjidiagne002@gmail.com"
push "GROQ_API_KEY"             "${GROQ_API_KEY:-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}"
push "EMAILJS_PRIVATE_KEY"      "${EMAILJS_PRIVATE_KEY:-MYTRFE7rqZ2rC7IZcRTuf}"
push "INTERNAL_API_KEY"         "nexus-internal-2024"
push "DELIVERY_WEBHOOK_SECRET"  "nexus-delivery-secret-2024"

[[ -n "${INFOBIP_API_KEY:-}" ]]  && push "INFOBIP_API_KEY" "$INFOBIP_API_KEY"
[[ -n "${INFOBIP_BASE_URL:-}" ]] && push "INFOBIP_BASE_URL" "$INFOBIP_BASE_URL"
[[ -n "${APIX_API_KEY:-}" ]]     && push "APIX_API_KEY" "$APIX_API_KEY"

echo -e "\n${GREEN}✨ Terminé ! Vérifier dans CF Dashboard > Workers & Pages > Settings${NC}\n"
