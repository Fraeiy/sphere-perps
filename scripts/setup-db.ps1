# Sphere Perps — Database setup helper for Windows
param(
    [switch]$UseDocker
)

$ErrorActionPreference = "Stop"
$BackendDir = Join-Path $PSScriptRoot "..\backend"

Write-Host "`n=== Sphere Perps Database Setup ===`n" -ForegroundColor Cyan

if ($UseDocker) {
    Write-Host "Checking Docker Desktop..." -ForegroundColor Yellow
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nDocker Desktop is NOT running." -ForegroundColor Red
        Write-Host "  1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        Write-Host "  2. Start Docker Desktop and wait until it says 'Running'"
        Write-Host "  3. Re-run: .\scripts\setup-db.ps1 -UseDocker`n"
        exit 1
    }

    Write-Host "Starting PostgreSQL container..." -ForegroundColor Green
    Push-Location (Join-Path $PSScriptRoot "..")
    docker compose up postgres -d
    Pop-Location

    Start-Sleep -Seconds 5

    $envContent = @"
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://sphere:sphere_dev_password@localhost:5432/sphere_perps
JWT_SECRET=dev-jwt-secret-change-in-production
CORS_ORIGIN=http://localhost:5173
SPHERE_ORACLE_API_KEY=sk_ddc3cfcc001e4a28ac3fad7407f99590
SPHERE_WALLET_API_URL=https://wallet-api.unicity.network
SPHERE_TREASURY_NAMETAG=sphere-perps-treasury
AI_PROVIDER=mock
"@
    Set-Content -Path (Join-Path $BackendDir ".env") -Value $envContent
    Write-Host "Wrote backend/.env for Docker PostgreSQL" -ForegroundColor Green
} else {
    Write-Host "No Docker flag passed. Checking for existing PostgreSQL on localhost:5432..." -ForegroundColor Yellow

    $envFile = Join-Path $BackendDir ".env"
    if (-not (Test-Path $envFile)) {
        Write-Host "backend/.env not found. Copy from backend/.env.example" -ForegroundColor Red
        exit 1
    }

    $dbUrl = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" }) -replace "DATABASE_URL=", ""
    if ($dbUrl -match "localhost:5432" -or $dbUrl -match "127.0.0.1:5432") {
        Write-Host "`nPostgreSQL must be running at localhost:5432." -ForegroundColor Yellow
        Write-Host "`nChoose ONE option:`n"
        Write-Host "  A) Docker Desktop (local):" -ForegroundColor Cyan
        Write-Host "     .\scripts\setup-db.ps1 -UseDocker`n"
        Write-Host "  B) Free cloud database (no Docker):" -ForegroundColor Cyan
        Write-Host "     1. Create a free DB at https://neon.tech"
        Write-Host "     2. Copy the connection string"
        Write-Host "     3. Set DATABASE_URL in backend/.env"
        Write-Host "     4. Re-run: .\scripts\setup-db.ps1`n"
        exit 1
    }
}

Push-Location $BackendDir
Write-Host "Running prisma db push + seed..." -ForegroundColor Green
npm run db:setup
$code = $LASTEXITCODE
Pop-Location

if ($code -eq 0) {
    Write-Host "`nDatabase ready! Start the app with: npm run dev`n" -ForegroundColor Green
} else {
    Write-Host "`nDatabase setup failed. See errors above.`n" -ForegroundColor Red
    exit $code
}