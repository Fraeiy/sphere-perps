# Deployment Guide

## Architecture

| Service | Platform | Purpose |
|---------|----------|---------|
| Frontend | **Vercel** | React trading UI |
| Backend API | **Railway** or **Render** | Express + WebSocket |
| Database | **Neon** | PostgreSQL (already configured) |

## 1. Push to GitHub

```bash
cd sphere-perps
git init
git add .
git commit -m "Initial commit: Sphere Perps trading platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sphere-perps.git
git push -u origin main
```

## 2. Deploy Backend (Railway — recommended)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your `sphere-perps` repo
3. Set **Root Directory** to `backend` (or use monorepo with custom start)
4. Add environment variables:

```
DATABASE_URL=postgresql://neondb_owner:...@ep-xxx.neon.tech/neondb?sslmode=require
JWT_SECRET=<random-32-char-string>
CORS_ORIGIN=https://your-app.vercel.app
PORT=4000
SPHERE_ORACLE_API_KEY=sk_ddc3cfcc001e4a28ac3fad7407f99590
SPHERE_WALLET_API_URL=https://wallet-api.unicity.network
SPHERE_TREASURY_NAMETAG=sphere-perps-treasury
AI_PROVIDER=mock
```

5. **Build command:** `npm install && npx prisma generate && npm run build`
6. **Start command:** `npx prisma db push && node dist/index.js`
7. Copy your Railway public URL (e.g. `https://sphere-perps-api.up.railway.app`)

### Railway monorepo setup (from repo root)

- **Root Directory:** `/`
- **Build:** `npm install && npm run db:generate -w backend && npm run build -w backend`
- **Start:** `npm run start -w backend`

## 3. Deploy Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → Add New Project → Import GitHub repo
2. **Framework Preset:** Vite
3. **Root Directory:** leave as repo root (uses `vercel.json`)
4. Add environment variables:

```
VITE_API_URL=https://your-api.up.railway.app
VITE_WS_URL=wss://your-api.up.railway.app/ws
VITE_SPHERE_WALLET_URL=https://sphere.unicity.network
```

5. Deploy

## 4. Post-deploy checklist

- [ ] Update `CORS_ORIGIN` on backend to your Vercel URL
- [ ] Run `npm run db:setup` against Neon if schema not yet pushed
- [ ] Test `/health` on backend URL
- [ ] Test Connect Wallet on Vercel frontend
- [ ] Rotate Neon DB password (was shared in chat)

## 5. Sphere Wallet

Add your Vercel domain to allowed origins in Sphere Wallet when connecting from production.