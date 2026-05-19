#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  NEXUS Market — Phase 3 Installation (bash)
#  Compatible: macOS, Linux, Git Bash, WSL
# ═══════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}[i]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC}  $1"; }
err()   { echo -e "${RED}[X]${NC}  $1" >&2; }
title() { echo -e "\n${BOLD}${BLUE}=== $1 ===${NC}\n"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
SRC_DIR="$SCRIPT_DIR/nexus-phase3"

if [ ! -d "$SRC_DIR" ]; then
  if [ -f "$SCRIPT_DIR/index.html" ]; then
    SRC_DIR="$SCRIPT_DIR"
  else
    err "Folder 'nexus-phase3/' not found."
    exit 1
  fi
fi

title "Repository check"
if [ ! -d ".git" ]; then err "No git repository"; exit 1; fi
ok "Git repo: $(pwd)"
CURRENT_BRANCH=$(git branch --show-current)
info "Branch: $CURRENT_BRANCH"

if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  warn "Uncommitted changes:"
  git status --short
  read -p "Continue? (y/N) " -n 1 -r; echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
fi

title "Backup"
if [ -f "index.html" ]; then
  BACKUP="index.html.before-phase3.$(date +%Y%m%d-%H%M%S)"
  cp index.html "$BACKUP"
  ok "Backup: $BACKUP"
fi

title "Copying Phase 3 files"
cp "$SRC_DIR/index.html" ./index.html
ok "index.html updated ($(wc -l < index.html) lines, $(du -h index.html | cut -f1))"

mkdir -p functions/api/email
cp "$SRC_DIR/functions/api/email/send.js" functions/api/email/send.js
ok "functions/api/email/send.js installed"

read -p "Install Playwright E2E tests as well? (y/N) " -n 1 -r; echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  mkdir -p tests
  cp "$SRC_DIR/tests/checkout.spec.js" tests/checkout.spec.js
  cp "$SRC_DIR/playwright.config.js"   playwright.config.js
  if [ -f "package.json" ]; then
    warn "package.json already exists - NOT overwriting"
    info "Manual step: add @playwright/test to devDependencies"
  else
    cp "$SRC_DIR/package.json" package.json
    ok "package.json installed"
  fi
  ok "Playwright tests installed"
fi

if [ -f "$SRC_DIR/SUPABASE_RLS_AUDIT_PHASE3.sql" ]; then
  info "SQL audit: $SRC_DIR/SUPABASE_RLS_AUDIT_PHASE3.sql (run manually in Supabase)"
fi

title "Summary"
git status --short
echo ""
echo -e "${BOLD}Phase 3:${NC}"
echo "  - New Cloudflare Function /api/email/send (Resend/EmailJS/simulate)"
echo "  - Frontend EmailService prefers backend proxy when available"
echo "  - Optional Playwright E2E tests"
echo "  - SQL audit script for RLS consolidation"
echo ""

read -p "Commit and push to GitHub? (y/N) " -n 1 -r; echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  info "Changes applied locally only."
  exit 0
fi

title "Commit and push"
git add .

git commit -m "NEXUS Market - Phase 3 (Hardening continued)

Server-side email proxy:
- New Cloudflare Function /api/email/send
- Supports Resend, EmailJS server-side, simulate mode
- Server-side rate limit (1 email/30s per recipient)
- Frontend EmailService prefers backend proxy when JWT + backend ready
- Falls back to direct EmailJS only if backend KO

Tests:
- Playwright config + 5 E2E tests on critical paths
- Smoke test verifying Phase 1+2 markers

Documentation:
- SUPABASE_RLS_AUDIT_PHASE3.sql for policy consolidation"

ok "Commit created"

info "Pushing to origin/$CURRENT_BRANCH..."
git push origin "$CURRENT_BRANCH"
ok "Push successful!"

title "Next steps"
cat <<EOF

1. Configure email provider in Cloudflare Pages env vars:

   Recommended (Resend, 100 emails/day free):
     EMAIL_PROVIDER       = resend
     RESEND_API_KEY       = re_...
     EMAIL_FROM           = NEXUS Market <no-reply@yourdomain.com>

   Or EmailJS server-side:
     EMAIL_PROVIDER       = emailjs
     EMAILJS_SERVICE_ID   = service_84yfkgf
     EMAILJS_TEMPLATE_ID  = template_t075pts
     EMAILJS_PUBLIC_KEY   = WSBntSTWdh5d9usZC
     EMAILJS_PRIVATE_KEY  = (optional)

   Or for dev:
     EMAIL_PROVIDER       = simulate

2. Test the new endpoint:
   curl -X POST https://5d15ae2f.nexus-market-asb.pages.dev/api/email/send \\
     -H "Authorization: Bearer TOKEN" \\
     -H "Content-Type: application/json" \\
     -d '{"to":"test@example.com","subject":"Test","html":"<p>Hello</p>"}'

3. (Optional) Playwright tests:
   npm install
   npx playwright install chromium
   npx playwright test

4. (Optional) RLS policy consolidation:
   Open SUPABASE_RLS_AUDIT_PHASE3.sql in SQL Editor and review.

EOF

ok "Phase 3 done!"
