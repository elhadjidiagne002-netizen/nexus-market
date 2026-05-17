# scripts/setup-cf-secrets.ps1 - Injection secrets Cloudflare Workers
# Usage : wrangler login ; .\scripts\setup-cf-secrets.ps1

function Push-Secret($name, $value) {
    if ([string]::IsNullOrEmpty($value)) { Write-Host "  IGNORE: $name" -ForegroundColor Yellow; return }
    $value | wrangler secret put $name 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "  OK  $name" -ForegroundColor Green }
    else                     { Write-Host "  !!  ECHEC: $name" -ForegroundColor Red }
}

Write-Host "`n Injection secrets Cloudflare...`n" -ForegroundColor Cyan

Push-Secret "SUPABASE_SERVICE_KEY"    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzQ5MiwiZXhwIjoyMDkwMzg5NDkyfQ.fBlPt4g40xZ5F3lbempAYNuLZtvcnwxshnipACZPy08"
Push-Secret "SUPABASE_SERVICE_ROLE_KEY" "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzQ5MiwiZXhwIjoyMDkwMzg5NDkyfQ.fBlPt4g40xZ5F3lbempAYNuLZtvcnwxshnipACZPy08"
Push-Secret "JWT_SECRET"               "32b7d9b81f59004dbb00efde2a1956bda5886742aaa1dca83506de503db1b34c"
Push-Secret "REFRESH_TOKEN_SECRET"     "bf2697e53a4c9dd2dd200e76c0241b9d221c5a1fc720c86999502f877e1c863ef"
Push-Secret "STRIPE_SECRET_KEY"        "sk_test_51TGdXe1H2qyHRVYhe7XAk8L4W0KuGOA46QsyVfbekSYd9O3dExf7R7ODZo21DWd7G6HNuL7V5OVAilIj3H0GUYfS00xaayPhVe"
Push-Secret "STRIPE_WEBHOOK_SECRET"    "whsec_Xlt4nDaTfXw0MVWKwcee5ljjJLP4QDl8"
Push-Secret "SMTP_PASS"                "lokaasorlefafaze"
Push-Secret "VAPID_PRIVATE_KEY"        "c_sPmJ7KJzVW4ZGIheVHPiCF8fq5lBF09-tH96vRSH0"
Push-Secret "VAPID_SUBJECT"            "mailto:elhadjidiagne002@gmail.com"
Push-Secret "GROQ_API_KEY"             "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"
Push-Secret "EMAILJS_PRIVATE_KEY"      "MYTRFE7rqZ2rC7IZcRTuf"
Push-Secret "INTERNAL_API_KEY"         "nexus-internal-2024"
Push-Secret "DELIVERY_WEBHOOK_SECRET"  "nexus-delivery-secret-2024"

Write-Host "`n Termine ! Verifier dans CF Dashboard > Workers & Pages > Settings`n" -ForegroundColor Green