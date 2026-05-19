# ===========================================================================
#  NEXUS Market - Phase 3 Installation (PowerShell)
# ---------------------------------------------------------------------------
#  Compatible PowerShell 5.1+ et PowerShell 7+
#  ASCII-only pour eviter les problemes d'encodage
# ===========================================================================

$ErrorActionPreference = "Stop"

function Write-Info  ($msg) { Write-Host "[i]  $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn  ($msg) { Write-Host "[!]  $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "[X]  $msg" -ForegroundColor Red }
function Write-Title ($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Blue
    Write-Host ""
}

# --- Locate source --------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SrcDir = Join-Path $ScriptDir "nexus-phase3"

if (-not (Test-Path -LiteralPath $SrcDir)) {
    $maybeIndex = Join-Path $ScriptDir "index.html"
    if (Test-Path -LiteralPath $maybeIndex) {
        $SrcDir = $ScriptDir
    } else {
        Write-Err "Folder 'nexus-phase3' not found."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Info "Source: $SrcDir"

# --- Verify git repo ------------------------------------------------------
Write-Title "Repository check"

if (-not (Test-Path -LiteralPath ".git")) {
    Write-Err "No git repository in $(Get-Location)"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok "Git repo: $(Get-Location)"

$CurrentBranch = (git branch --show-current).Trim()
Write-Info "Branch: $CurrentBranch"

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warn "Uncommitted changes detected:"
    git status --short
    $resp = Read-Host "Continue anyway? (y/N)"
    if ($resp -notmatch '^[Yy]') { exit 0 }
}

# --- Backup ---------------------------------------------------------------
Write-Title "Backup"

if (Test-Path -LiteralPath "index.html") {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $bak = "index.html.before-phase3.$ts"
    Copy-Item -LiteralPath "index.html" -Destination $bak
    Write-Ok "Backup: $bak"
}

# --- Copy Phase 3 files ---------------------------------------------------
Write-Title "Copying Phase 3 files"

# 1. index.html
Copy-Item -LiteralPath (Join-Path $SrcDir "index.html") -Destination ".\index.html" -Force
$sz = [math]::Round((Get-Item -LiteralPath "index.html").Length / 1KB, 1)
$ln = (Get-Content -LiteralPath "index.html" | Measure-Object -Line).Lines
Write-Ok "index.html updated ($ln lines, $sz KB)"

# 2. New Cloudflare Function: /api/email/send
if (-not (Test-Path -LiteralPath "functions\api\email")) {
    New-Item -ItemType Directory -Force -Path "functions\api\email" | Out-Null
}
Copy-Item -LiteralPath (Join-Path $SrcDir "functions\api\email\send.js") -Destination "functions\api\email\send.js" -Force
Write-Ok "functions/api/email/send.js installed"

# 3. Tests (optional - only if user wants to run E2E tests)
$installTests = Read-Host "Install Playwright E2E tests as well? (y/N)"
if ($installTests -match '^[Yy]') {
    if (-not (Test-Path -LiteralPath "tests")) {
        New-Item -ItemType Directory -Force -Path "tests" | Out-Null
    }
    Copy-Item -LiteralPath (Join-Path $SrcDir "tests\checkout.spec.js") -Destination "tests\checkout.spec.js" -Force
    Copy-Item -LiteralPath (Join-Path $SrcDir "playwright.config.js")   -Destination "playwright.config.js"   -Force

    # Si pas de package.json existant, on copie le notre. Sinon, on prevent l'user.
    if (Test-Path -LiteralPath "package.json") {
        Write-Warn "package.json already exists - NOT overwriting"
        Write-Info "Manual step: add @playwright/test to your devDependencies:"
        Write-Info '   "@playwright/test": "^1.49.0"'
    } else {
        Copy-Item -LiteralPath (Join-Path $SrcDir "package.json") -Destination "package.json" -Force
        Write-Ok "package.json installed"
    }
    Write-Ok "Playwright tests installed in ./tests/"
} else {
    Write-Info "Tests skipped"
}

# SQL audit is shown but NOT copied (it's a review tool)
$sqlPath = Join-Path $SrcDir "SUPABASE_RLS_AUDIT_PHASE3.sql"
if (Test-Path -LiteralPath $sqlPath) {
    Write-Info "SQL audit script: $sqlPath"
    Write-Info "  -> Run in Supabase Dashboard > SQL Editor (do NOT commit)"
}

# --- Summary --------------------------------------------------------------
Write-Title "Summary of changes"

git status --short

Write-Host ""
Write-Host "Phase 3 corrections:" -ForegroundColor White
Write-Host "  - New Cloudflare Function: POST /api/email/send"
Write-Host "    (proxy server-side hiding the EmailJS public key)"
Write-Host "  - Frontend: EmailService now prefers /api/email/send when backend ready"
Write-Host "    Falls back to direct EmailJS only when offline"
Write-Host "  - Playwright E2E tests for critical paths (optional)"
Write-Host "  - SQL audit script for RLS policy consolidation"
Write-Host ""

$resp = Read-Host "Commit and push to GitHub? (y/N)"
if ($resp -notmatch '^[Yy]') {
    Write-Info "Changes applied locally. Manual commit:"
    Write-Host "   git add ."
    Write-Host "   git commit -m 'NEXUS Phase 3'"
    Write-Host "   git push"
    Read-Host "Press Enter to exit"
    exit 0
}

# --- Commit + push --------------------------------------------------------
Write-Title "Commit and push"

git add .

$msgFile = [System.IO.Path]::GetTempFileName()
$lines = @(
    "NEXUS Market - Phase 3 (Hardening continued)",
    "",
    "Server-side email proxy:",
    "- New Cloudflare Function /api/email/send",
    "- Supports Resend, EmailJS server-side, simulate mode",
    "- Server-side rate limit (1 email/30s per recipient)",
    "- Frontend EmailService prefers backend proxy when JWT + backend ready",
    "- Falls back to direct EmailJS only if backend KO",
    "",
    "Tests:",
    "- Playwright config + 5 E2E tests on critical paths",
    "- Smoke test verifying Phase 1+2 markers in production index.html",
    "",
    "Documentation:",
    "- SUPABASE_RLS_AUDIT_PHASE3.sql for consolidating duplicate policies",
    "  (messages: 18 policies, products: 16) - review tool, no auto-changes"
)
Set-Content -LiteralPath $msgFile -Value $lines -Encoding UTF8

git commit -F $msgFile
Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Err "Commit failed."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok "Commit created"

Write-Info "Pushing to origin/$CurrentBranch..."
git push origin $CurrentBranch
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Push successful!"
} else {
    Write-Err "Push failed. Try manually: git push"
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Post-deploy ----------------------------------------------------------
Write-Title "Phase 3 deployed - Next steps"

Write-Host @"

1. Configure email provider (Cloudflare Pages env vars):

   Recommended: Resend (https://resend.com) - 100 emails/day free
     EMAIL_PROVIDER       = resend
     RESEND_API_KEY       = re_...
     EMAIL_FROM           = NEXUS Market <no-reply@yourdomain.com>

   Or keep EmailJS but server-side:
     EMAIL_PROVIDER       = emailjs
     EMAILJS_SERVICE_ID   = service_84yfkgf
     EMAILJS_TEMPLATE_ID  = template_t075pts
     EMAILJS_PUBLIC_KEY   = WSBntSTWdh5d9usZC
     EMAILJS_PRIVATE_KEY  = (optional, for server-side auth)

   Or for now in dev:
     EMAIL_PROVIDER       = simulate

2. Test the new endpoint (replace TOKEN with a valid JWT):
   curl -X POST https://5d15ae2f.nexus-market-asb.pages.dev/api/email/send \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"to":"test@example.com","subject":"Test","html":"<p>Hello</p>"}'

3. (Optional) Run Playwright tests if you installed them:
   npm install
   npx playwright install chromium
   npx playwright test

4. (Optional) Run RLS audit:
   - Open SUPABASE_RLS_AUDIT_PHASE3.sql in Supabase SQL Editor
   - Section 1: see all policies on heavy-policy tables
   - Section 2: detect duplicates (same operation, similar conditions)
   - Section 3: find policies with USING = true (public access)
   - Cleanup is manual via DROP POLICY based on what you see

"@ -ForegroundColor White

Write-Ok "Phase 3 done! Phases 1+2+3 complete."
Read-Host "Press Enter to exit"
