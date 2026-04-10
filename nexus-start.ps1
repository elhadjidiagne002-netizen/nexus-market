# ============================================================
#  NEXUS Market Senegal — Lanceur Windows
#  Placer ce fichier dans C:\Users\pheni\Downloads\nexus-market\
#  Lancer : clic-droit → "Exécuter avec PowerShell"
#       ou : .\nexus-start.ps1
# ============================================================
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
$Host.UI.RawUI.WindowTitle = "NEXUS Market"
$ErrorActionPreference = "Stop"

function OK    { param($m) Write-Host "  [OK]  $m" -ForegroundColor Green   }
function WARN  { param($m) Write-Host "  [!!]  $m" -ForegroundColor Yellow  }
function ERR   { param($m) Write-Host "  [XX]  $m" -ForegroundColor Red     }
function INFO  { param($m) Write-Host "  [--]  $m" -ForegroundColor Cyan    }
function FIXED { param($m) Write-Host "  [>>]  $m" -ForegroundColor Magenta }
function STEP  { param($n,$t) Write-Host "`n  [$n] $t" -ForegroundColor White }
function Pause { Read-Host "`n  Entree pour quitter"; exit 1 }

Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║      NEXUS Market Senegal — Demarrage v3         ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# ════════════════════════════════════════════════════════════
#  1. Node.js >= 18
# ════════════════════════════════════════════════════════════
STEP "1/6" "Verification Node.js"
try {
    $nv = (node --version 2>&1).ToString()
    if ($nv -match "v(\d+)\." -and [int]$Matches[1] -ge 18) {
        OK "Node.js $nv detecte"
    } else {
        ERR "Node.js $nv trop ancien — v18+ requis : https://nodejs.org"
        Pause
    }
} catch {
    ERR "Node.js introuvable — telecharger : https://nodejs.org"
    Pause
}

# ════════════════════════════════════════════════════════════
#  2. Fichiers et dependances
# ════════════════════════════════════════════════════════════
STEP "2/6" "Verification des fichiers"

foreach ($f in @("server.js", "package.json")) {
    if (Test-Path $f) { OK "$f present" }
    else {
        ERR "$f manquant — etes-vous dans le bon dossier ?"
        INFO "Dossier courant : $(Get-Location)"
        Pause
    }
}

if (-not (Test-Path "node_modules")) {
    WARN "node_modules absent — lancement de npm install..."
    npm install
    if ($LASTEXITCODE -ne 0) { ERR "npm install a echoue"; Pause }
    OK "Dependances installees"
} else {
    OK "node_modules present"
}

# ════════════════════════════════════════════════════════════
#  3. Lecture du .env
# ════════════════════════════════════════════════════════════
STEP "3/6" "Lecture du fichier .env"

if (-not (Test-Path ".env")) {
    $ex = @("env.example", ".env.example", "_env.example") |
          Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($ex) {
        Copy-Item $ex ".env"
        FIXED ".env cree depuis $ex"
        WARN "Remplissez .env avec vos vraies valeurs puis relancez"
        notepad .env
        Pause
    } else {
        ERR ".env introuvable et aucun exemple disponible"
        Pause
    }
}

$D = @{}
foreach ($line in (Get-Content ".env" -Encoding UTF8)) {
    $line = $line.Trim()
    if ($line -match "^([A-Z_][A-Z0-9_]*)=(.*)$") {
        $D[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
OK "$($D.Count) variables lues depuis .env"

# ════════════════════════════════════════════════════════════
#  4. Corrections automatiques
# ════════════════════════════════════════════════════════════
STEP "4/6" "Diagnostic et corrections automatiques"

$changed = $false

# ── 4a. Verifier que SUPABASE_SERVICE_KEY est bien service_role ──
$sk = $D["SUPABASE_SERVICE_KEY"]
if (-not $sk -or $sk.Length -lt 50 -or $sk -like "*REMPLACER*") {
    ERR "SUPABASE_SERVICE_KEY absent ou invalide"
    INFO "Supabase → Settings → API → copier 'service_role'"
    $proj = if ($D["SUPABASE_URL"] -match "https://([^.]+)") { $Matches[1] } else { "" }
    if ($proj) { Start-Process "https://supabase.com/dashboard/project/$proj/settings/api" }
    Write-Host "  Collez la service_role key :" -ForegroundColor Yellow
    $nk = (Read-Host "  >").Trim()
    if ($nk.Length -gt 100) {
        $D["SUPABASE_SERVICE_KEY"] = $nk
        $changed = $true
        FIXED "SUPABASE_SERVICE_KEY mis a jour"
    } else { ERR "Cle invalide"; Pause }
} else {
    # Decoder le JWT pour verifier le role
    try {
        $pl  = $sk.Split(".")[1]
        $pl += "=" * ((4 - $pl.Length % 4) % 4)
        $role = ([System.Text.Encoding]::UTF8.GetString(
                    [Convert]::FromBase64String(
                        $pl.Replace("-", "+").Replace("_", "/")
                    )
                ) | ConvertFrom-Json).role

        if ($role -eq "service_role") {
            OK "SUPABASE_SERVICE_KEY valide (service_role)"
        } elseif ($role -eq "anon") {
            Write-Host ""
            Write-Host "  ╔════════════════════════════════════════════════════╗" -ForegroundColor Red
            Write-Host "  ║  MAUVAISE CLE : vous avez mis la cle 'anon'        ║" -ForegroundColor Red
            Write-Host "  ║  Il faut la cle 'service_role' (en bas dans API)   ║" -ForegroundColor Red
            Write-Host "  ╚════════════════════════════════════════════════════╝" -ForegroundColor Red
            Write-Host ""
            $proj = if ($D["SUPABASE_URL"] -match "https://([^.]+)") { $Matches[1] } else { "" }
            $go = Read-Host "  Ouvrir Supabase dashboard ? (O/n)"
            if ($go -ne "n") {
                Start-Process "https://supabase.com/dashboard/project/$proj/settings/api"
            }
            Write-Host "  Collez la service_role key (eyJ...) :" -ForegroundColor Yellow
            $nk = (Read-Host "  >").Trim()
            if ($nk.Length -gt 100) {
                $D["SUPABASE_SERVICE_KEY"] = $nk
                $changed = $true
                FIXED "SUPABASE_SERVICE_KEY corrige"
            } else { ERR "Cle invalide"; Pause }
        } else {
            WARN "Role JWT inconnu : $role — cle conservee telle quelle"
        }
    } catch {
        WARN "Impossible de decoder le JWT — cle conservee"
    }
}

# ── 4b. PORT coherent avec FRONTEND_URL ─────────────────────
$port = if ($D["PORT"]) { $D["PORT"] } else { "3001" }
$furl = $D["FRONTEND_URL"]
if ($furl -and $furl -notlike "*:$port*") {
    WARN "PORT=$port incompatible avec FRONTEND_URL=$furl"
    $D["FRONTEND_URL"] = "http://localhost:$port"
    $changed = $true
    FIXED "FRONTEND_URL → http://localhost:$port"
} else {
    OK "PORT=$port coherent avec FRONTEND_URL"
}

# ── 4c. Valeurs par defaut pour les cles absentes ───────────
$defaults = @{
    PORT         = "3001"
    NODE_ENV     = "development"
    FRONTEND_URL = "http://localhost:3001"
    BACKEND_URL  = "http://localhost:3001"
    SMTP_HOST    = "smtp.gmail.com"
    SMTP_PORT    = "587"
}
foreach ($k in $defaults.Keys) {
    if (-not $D[$k]) {
        $D[$k] = $defaults[$k]
        $changed = $true
        FIXED "Defaut ajoute : $k = $($defaults[$k])"
    }
}

# ── 4d. Stripe ───────────────────────────────────────────────
$stripe = $D["STRIPE_SECRET_KEY"]
if ($stripe -like "sk_test_*") {
    OK "Stripe mode TEST"
} elseif ($stripe -like "sk_live_*") {
    OK "Stripe mode PRODUCTION"
} else {
    WARN "Stripe non configure — paiements en simulation"
    INFO "Obtenir une cle : dashboard.stripe.com → API keys"
    if (-not $D.ContainsKey("STRIPE_SECRET_KEY")) {
        $D["STRIPE_SECRET_KEY"]     = "sk_test_REMPLACER"
        $D["STRIPE_WEBHOOK_SECRET"] = "whsec_REMPLACER"
        $changed = $true
    }
}

# ── 4e. SMTP ─────────────────────────────────────────────────
$su = $D["SMTP_USER"]
if ($su -and $su -notlike "*votre*" -and $su -notlike "*REMPLACER*" -and $su -match "@") {
    OK "SMTP : $su"
} else {
    WARN "SMTP non configure — emails desactives (app reste fonctionnelle)"
    INFO "Configurer : myaccount.google.com → Securite → Mots de passe des applications"
}

# ── 4f. Sauvegarder .env corrige ────────────────────────────
if ($changed) {
    Copy-Item ".env" ".env.backup" -Force
    $out     = @()
    $written = @{}

    foreach ($line in (Get-Content ".env.backup" -Encoding UTF8)) {
        $l = $line.Trim()
        if ($l -eq "" -or $l.StartsWith("#")) {
            $out += $line
            continue
        }
        if ($l -match "^([A-Z_][A-Z0-9_]*)=") {
            $k = $Matches[1]
            if ($D.ContainsKey($k)) {
                $out += "$k=$($D[$k])"
                $written[$k] = $true
            }
        } else {
            $out += $line
        }
    }
    foreach ($k in $D.Keys) {
        if (-not $written.ContainsKey($k)) { $out += "$k=$($D[$k])" }
    }
    $out | Set-Content ".env" -Encoding UTF8
    FIXED ".env corrige (backup sauvegarde dans .env.backup)"
}

# ════════════════════════════════════════════════════════════
#  5. Resume de configuration
# ════════════════════════════════════════════════════════════
STEP "5/6" "Resume"
Write-Host ""

$critical_ok = $true
$resume = @(
    [ordered]@{ k = "SUPABASE_URL";         l = "Supabase URL";         req = $true  }
    [ordered]@{ k = "SUPABASE_SERVICE_KEY"; l = "Supabase Service Key"; req = $true  }
    [ordered]@{ k = "JWT_SECRET";           l = "JWT Secret";           req = $true  }
    [ordered]@{ k = "STRIPE_SECRET_KEY";    l = "Stripe";               req = $false }
    [ordered]@{ k = "SMTP_USER";            l = "Email SMTP";           req = $false }
)
foreach ($i in $resume) {
    $v  = $D[$i.k]
    $ok = $v -and $v.Length -gt 10 -and $v -notlike "*REMPLACER*" -and $v -notlike "*votre*"
    $ds = if ($v -and $v.Length -gt 14) {
              $v.Substring(0, 6) + "..." + $v.Substring($v.Length - 4)
          } else { "(vide)" }
    if ($ok) {
        Write-Host ("    [OK] " + $i.l.PadRight(24) + $ds) -ForegroundColor Green
    } else {
        $col = if ($i.req) { "Red" } else { "Yellow" }
        Write-Host ("    [!!] " + $i.l.PadRight(24) + "NON CONFIGURE") -ForegroundColor $col
        if ($i.req) { $critical_ok = $false }
    }
}
Write-Host ""

if (-not $critical_ok) {
    ERR "Variables critiques manquantes — corrigez .env et relancez"
    $r = Read-Host "  Ouvrir notepad .env ? (O/n)"
    if ($r -ne "n" -and $r -ne "N") { notepad .env }
    Pause
}

# ════════════════════════════════════════════════════════════
#  6. Lancement
# ════════════════════════════════════════════════════════════
STEP "6/6" "Lancement du serveur"

# Injecter toutes les variables dans l'environnement de la session
foreach ($k in $D.Keys) {
    $v = $D[$k]
    if ($v) {
        [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
        Set-Item -Path "env:$k" -Value $v -ErrorAction SilentlyContinue
    }
}

$final_port = if ($D["PORT"]) { $D["PORT"] } else { "3001" }

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║   Serveur : http://localhost:$final_port                    ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║   Fichiers a ouvrir dans Chrome / Edge :             ║" -ForegroundColor Green
Write-Host "  ║     index.html          →  Marche principal          ║" -ForegroundColor Green
Write-Host "  ║     nexus_admin.html    →  Administration            ║" -ForegroundColor Green
Write-Host "  ║     nexus_reset.html    →  Reinitialiser demo        ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║   Ctrl+C pour arreter le serveur                     ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Note : le warning DEP0169 est inoffensif (vient de Supabase)" -ForegroundColor DarkGray
Write-Host ""

# Lancer via dotenv (plus fiable que --env-file sur Windows)
$ErrorActionPreference = "Continue"
node -e "require('dotenv').config({ path: '.env' }); require('./server.js')"

Write-Host ""
Write-Host "  Serveur arrete." -ForegroundColor DarkGray
Read-Host "  Entree pour fermer"
