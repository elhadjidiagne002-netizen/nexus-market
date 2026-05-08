#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# patch-urls.sh — Remplace toutes les URLs Netlify Functions par leurs
#                 équivalentes Cloudflare Pages Functions dans index.html
#
# Usage : bash patch-urls.sh [chemin/vers/index.html]
# ─────────────────────────────────────────────────────────────────────────────

TARGET="${1:-index.html}"

if [ ! -f "$TARGET" ]; then
  echo "❌ Fichier introuvable : $TARGET"
  exit 1
fi

# Créer une sauvegarde avant modification
cp "$TARGET" "${TARGET}.bak"
echo "✅ Sauvegarde créée : ${TARGET}.bak"

# ── Remplacement principal ────────────────────────────────────────────────────
sed -i 's|/.netlify/functions/|/functions/|g' "$TARGET"
echo "✅ URLs /.netlify/functions/* → /functions/*"

# ── Cas spéciaux : si netlify.toml utilisait des redirects /api/* ─────────────
# Décommenter si votre netlify.toml avait des règles de type :
#   /api/payments/mobile-money → /.netlify/functions/payments-mobile-money
# sed -i 's|/api/payments/mobile-money|/functions/payments-mobile-money|g' "$TARGET"
# sed -i 's|/api/payments/webhook|/functions/paytech-webhook|g' "$TARGET"

echo ""
echo "══════════════════════════════════════════════════════"
echo "Vérifiez les remplacements effectués :"
grep -n "/functions/" "$TARGET" | head -30
echo "══════════════════════════════════════════════════════"
echo ""
echo "✅ Migration URLs terminée dans : $TARGET"
echo "   (original sauvegardé dans ${TARGET}.bak)"
