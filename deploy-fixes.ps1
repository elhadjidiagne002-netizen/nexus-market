$project = "C:\Users\pheni\Downloads\nexus-market"
Set-Location $project

Write-Host "============================================"
Write-Host "  NEXUS - Deploiement corrections completes"
Write-Host "============================================"
Write-Host ""

# 1. Synchroniser avec GitHub
Write-Host "[1/4] Synchronisation avec GitHub..."
git fetch origin
git reset --hard origin/main
Write-Host "[OK] Synchronise"

# 2. Copier les fichiers corriges depuis Downloads
Write-Host ""
Write-Host "[2/4] Copie des fichiers corriges..."

$files = @("server.js", "index.html", "package.json")
foreach ($f in $files) {
    $src = "C:\Users\pheni\Downloads\$f"
    if (Test-Path $src) {
        Copy-Item $src ".\$f" -Force
        Write-Host "[OK] $f copie"
    } else {
        Write-Host "[SKIP] $f non trouve dans Downloads"
    }
}

# 3. Committer
Write-Host ""
Write-Host "[3/4] Commit..."
git add server.js index.html package.json
git status

$changes = git diff --cached --name-only
if ($changes) {
    git commit -m "fix: bcryptjs, dotenv order, supabase.raw, password_reset table, app.listen, appliedCoupon"
    Write-Host "[OK] Commit effectue"
} else {
    Write-Host "[WARN] Aucun changement detecte - verifiez que les fichiers ont bien ete copies"
}

# 4. Push
Write-Host ""
Write-Host "[4/4] Push vers GitHub..."
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================"
    Write-Host "  SUCCES - Vercel va se redeployer !"
    Write-Host "============================================"
    Write-Host ""
    Write-Host "N'oubliez pas d'executer rpc_functions.sql dans Supabase !"
} else {
    Write-Host "[ERREUR] Push echoue"
}

pause
