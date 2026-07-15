# Connect sphere-perps to Vercel
# Run after: npm install (vercel CLI optional)

Write-Host "`n=== Vercel Setup for Sphere Perps ===`n" -ForegroundColor Cyan

Write-Host "Option 1 — GitHub Import (recommended):" -ForegroundColor Green
Write-Host "  1. Open: https://vercel.com/new/clone?repository-url=https://github.com/Fraeiy/sphere-perps"
Write-Host "  2. Click Import → authorize GitHub if prompted"
Write-Host "  3. Add Environment Variables (see below)"
Write-Host "  4. Deploy`n"

Write-Host "Option 2 — Vercel CLI:" -ForegroundColor Green
Write-Host "  npx vercel login"
Write-Host "  npx vercel link"
Write-Host "  npx vercel env add VITE_API_URL"
Write-Host "  npx vercel env add VITE_WS_URL"
Write-Host "  npx vercel env add VITE_SPHERE_WALLET_URL"
Write-Host "  npx vercel --prod`n"

Write-Host "Required Environment Variables:" -ForegroundColor Yellow
Write-Host "  VITE_API_URL          = https://sphere-perps-api.onrender.com"
Write-Host "  VITE_WS_URL           = wss://sphere-perps-api.onrender.com/ws"
Write-Host "  VITE_SPHERE_WALLET_URL = https://sphere.unicity.network`n"

Write-Host "Build settings (auto-detected from vercel.json):" -ForegroundColor Gray
Write-Host "  Build Command:  npm run build -w frontend"
Write-Host "  Output Dir:     frontend/dist"
Write-Host "  Install:        npm install`n"

$open = Read-Host "Open Vercel import page in browser? (Y/n)"
if ($open -ne 'n') {
    Start-Process "https://vercel.com/new/clone?repository-url=https://github.com/Fraeiy/sphere-perps&project-name=sphere-perps&framework=vite"
}