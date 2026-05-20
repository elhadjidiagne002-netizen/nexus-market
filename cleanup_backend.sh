#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  NEXUS Market — Nettoyage refonte tout-Supabase
#  Archive PUIS retire le code backend mort, en GARDANT l'infra paiement.
#
#  À exécuter depuis la racine du projet :  bash cleanup_backend.sh
#  Réversible : tout est d'abord archivé dans _archive_backend_<date>.tar.gz
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

STAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="_archive_backend_${STAMP}.tar.gz"

echo "▶ NEXUS — nettoyage backend (tout-Supabase)"

# ── Ce qui est SUPPRIMÉ (code mort) ─────────────────────────────────────────
#   - api/                  : serveur Express Railway (non utilisé sur CF Pages)
#   - nexus-backend/        : 2e serveur Express (doublon)
#   - functions/api/<crud>  : ancienne API REST (remplacée par Supabase direct)
#
# ── Ce qui est GARDÉ (infra vivante) ────────────────────────────────────────
#   - functions/api/payments  + webhooks + _lib  (PayTech/Stripe server-side)
#   - functions/api/health.js, ping.js
#   - functions/*.js (racine)  (paytech-webhook, push, confirm-email, loyalty…)
#   - netlify/functions/       (cible de déploiement alternative)
#   - database/, index.html, public/, configs

# Sous-dossiers CRUD morts de functions/api à retirer
DEAD_API=(
  admin ai ambassador analytics auth b2b cart coupons delivery disputes
  email flash-sales invoices live loyalty messages notifications offers
  ondemand orders payout payouts products profiles referrals refunds
  returns reviews sms stock-alerts upload users wishlists
)

# Construire la liste des cibles existantes
TARGETS=()
[ -d api ]           && TARGETS+=("api")
[ -d nexus-backend ] && TARGETS+=("nexus-backend")
[ -f functions/api/upload.js ] && TARGETS+=("functions/api/upload.js")
for d in "${DEAD_API[@]}"; do
  [ -d "functions/api/$d" ] && TARGETS+=("functions/api/$d")
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "✔ Rien à nettoyer (déjà fait)."
  exit 0
fi

echo "▶ Archivage de ${#TARGETS[@]} cible(s) → ${ARCHIVE}"
tar -czf "$ARCHIVE" "${TARGETS[@]}"

echo "▶ Suppression…"
for t in "${TARGETS[@]}"; do
  rm -rf "$t"
  echo "   ✗ $t"
done

echo "✔ Terminé. Archive de sécurité : ${ARCHIVE}"
echo "  Conservé : functions/api/{payments,webhooks,_lib,health.js,ping.js}"
echo "             functions/*.js racine, netlify/functions/, database/, index.html"
echo ""
echo "  En cas de besoin de restauration :  tar -xzf ${ARCHIVE}"
