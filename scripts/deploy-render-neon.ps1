# Deploy Express API to Render with Neon PostgreSQL
# Run after Neon DATABASE_URL is in backend/.env

Write-Host "`n=== Sphere Perps: Render + Neon Deploy ===`n" -ForegroundColor Cyan

$dbLine = Get-Content "$PSScriptRoot\..\backend\.env" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^DATABASE_URL=' }
if (-not $dbLine) {
    Write-Host "ERROR: Set DATABASE_URL in backend/.env (Neon connection string)" -ForegroundColor Red
    exit 1
}

Write-Host "Neon DATABASE_URL found in backend/.env" -ForegroundColor Green
Write-Host "`n1. Open Render Blueprint:" -ForegroundColor Yellow
Write-Host "   https://dashboard.render.com/select-repo?type=blueprint&repo=https://github.com/Fraeiy/sphere-perps"
Write-Host "`n2. When prompted, set DATABASE_URL to your Neon string (same as backend/.env)"
Write-Host "`n3. After deploy, verify:" -ForegroundColor Yellow
Write-Host "   https://sphere-perps-api.onrender.com/health"
Write-Host "   https://sphere-perps-api.onrender.com/markets"
Write-Host "`nVercel frontend is already configured:" -ForegroundColor Green
Write-Host "   VITE_API_URL=https://sphere-perps-api.onrender.com"
Write-Host "   VITE_WS_URL=wss://sphere-perps-api.onrender.com/ws`n"

$open = Read-Host "Open Render Blueprint in browser? (Y/n)"
if ($open -ne 'n') {
    Start-Process "https://dashboard.render.com/select-repo?type=blueprint&repo=https://github.com/Fraeiy/sphere-perps"
}