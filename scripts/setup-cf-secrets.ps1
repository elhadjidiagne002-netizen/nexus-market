# ============================================================================
# Pousse les secrets Cloudflare PAGES depuis le fichier .env LOCAL (jamais commité).
# AUCUNE valeur en dur ici (l'ancienne version contenait des secrets en clair).
#
# Prérequis :
#   1. npm i -g wrangler ; wrangler login
#   2. Renseigner les valeurs ROTÉES dans .env (cf. .env.example)
# Usage : .\scripts\setup-cf-secrets.ps1
# ============================================================================
$ErrorActionPreference = "Stop"
$Project = "nexus-market"
$EnvFile = Join-Path $PSScriptRoot "..\.env"

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  Write-Host "wrangler absent : npm i -g wrangler ; wrangler login" -ForegroundColor Red; exit 1
}
if (-not (Test-Path $EnvFile)) {
  Write-Host "Fichier .env introuvable : $EnvFile" -ForegroundColor Red; exit 1
}

# Parse .env -> hashtable (sans le sourcer)
$envVars = @{}
foreach ($line in Get-Content $EnvFile) {
  $t = $line.Trim()
  if ($t -eq "" -or $t.StartsWith("#")) { continue }
  $idx = $t.IndexOf("=")
  if ($idx -lt 1) { continue }
  $k = $t.Substring(0, $idx).Trim()
  $v = $t.Substring($idx + 1).Trim().Trim('"').Trim("'")
  $envVars[$k] = $v
}

# Seuls les SECRETS sont poussés ici. Les variables PUBLIQUES restent dans wrangler.toml [vars].
$secrets = @(
  "SUPABASE_SERVICE_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "PAYTECH_API_KEY", "PAYTECH_API_SECRET",
  "RESEND_API_KEY", "GROQ_API_KEY",
  "VAPID_PRIVATE_KEY",
  "GREEN_API_TOKEN", "NEXUS_WA_SECRET",
  "INTERNAL_API_KEY", "DELIVERY_WEBHOOK_SECRET",
  "CRON_SECRET", "ADMIN_USER_ID",
  "SMTP_PASS"
)

Write-Host "`n[*] Injection des secrets Cloudflare Pages ($Project)...`n" -ForegroundColor Cyan
foreach ($name in $secrets) {
  $val = $envVars[$name]
  if ([string]::IsNullOrWhiteSpace($val)) {
    Write-Host "  SKIP (absent du .env) : $name" -ForegroundColor Yellow
    continue
  }
  $val | wrangler pages secret put $name --project-name $Project | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "  OK   $name" -ForegroundColor Green }
  else                     { Write-Host "  FAIL $name" -ForegroundColor Red }
}
Write-Host "`n[OK] Termine. Verifier : CF Dashboard - Workers and Pages - $Project - Settings - Variables`n" -ForegroundColor Green
