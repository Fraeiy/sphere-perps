# Deployment Guide

## Architecture (Neon + Express + Vercel)

| Service | Platform | Cost |
|---------|----------|------|
| Frontend | **Vercel** | Free |
| API + Trading Engine + WebSocket | **Render** (Express) | Free tier |
| Database | **Neon PostgreSQL** | Free tier |

> Uses the original Express/Prisma backend in `backend/` with Neon as the database.
> The `supabase/` folder is legacy and not used in production.

---

## 1. Neon database

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string (with `?sslmode=require`)
3. Set as `DATABASE_URL` in `backend/.env` locally and in Render

```powershell
cd sphere-perps/backend
# Edit .env with your Neon DATABASE_URL
npm run db:push
npm run db:seed
```

---

## 2. Backend — Render

1. Go to [Render Dashboard](https://dashboard.render.com/create?type=web)
2. Connect repo `Fraeiy/sphere-perps`
3. Settings:
   - **Build:** `npm install && npm run db:generate -w backend && npm run build -w backend`
   - **Start:** `npm run db:push -w backend && npm run start -w backend`
   - **Health check:** `/health`

4. Environment variables:

```
NODE_ENV=production
PORT=4000
DATABASE_URL=<your-neon-connection-string>
JWT_SECRET=<random 32+ char string>
CORS_ORIGIN=https://sphere-perps.vercel.app
SPHERE_ORACLE_API_KEY=sk_ddc3cfcc001e4a28ac3fad7407f99590
SPHERE_WALLET_API_URL=https://wallet-api.unicity.network
SPHERE_TREASURY_NAMETAG=sphere-perps-treasury
AI_PROVIDER=mock
```

Or use the included `render.yaml` Blueprint.

---

## 3. Frontend — Vercel

**Live:** https://sphere-perps.vercel.app

Set environment variables (remove any `VITE_SUPABASE_*` vars):

```
VITE_API_URL=https://sphere-perps-api.onrender.com
VITE_WS_URL=wss://sphere-perps-api.onrender.com/ws
VITE_SPHERE_WALLET_URL=https://sphere.unicity.network
```

Redeploy after updating vars.

---

## 4. Verify

1. `https://sphere-perps-api.onrender.com/health` → `{ "status": "ok" }`
2. `https://sphere-perps-api.onrender.com/markets` → 6 markets
3. https://sphere-perps.vercel.app → markets load, Connect Wallet works

---

## Local development

```powershell
# Terminal 1 — API (uses Neon via backend/.env)
cd sphere-perps
npm run dev -w backend

# Terminal 2 — Frontend (proxies /api → localhost:4000)
npm run dev -w frontend
```

Frontend uses `/api` proxy in dev — no Vercel env vars needed locally.