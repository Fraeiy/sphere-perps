# Deployment Guide

## Architecture (all free tiers)

| Service | Platform | Cost |
|---------|----------|------|
| Frontend | **Vercel** | Free |
| Backend API | **Render** | Free (750 hrs/mo) |
| Database | **Neon** | Free |

> **No Railway required.** Render's free web service runs your Express + WebSocket backend.

## Free tier limits to know

| Platform | Limit |
|----------|-------|
| **Render** | Spins down after 15 min idle; ~30s cold start on wake |
| **Neon** | 0.5 GB storage, compute hours capped |
| **Vercel** | 100 GB bandwidth/mo on hobby |

---

## 1. Database — Neon (done)

You already have Neon configured. Use your connection string as `DATABASE_URL`.

---

## 2. Frontend — Vercel (done)

**Live:** https://sphere-perps.vercel.app

After backend deploy, add these in Vercel → Settings → Environment Variables:

```
VITE_API_URL=https://sphere-perps-api.onrender.com
VITE_WS_URL=wss://sphere-perps-api.onrender.com/ws
VITE_SPHERE_WALLET_URL=https://sphere.unicity.network
```

Then redeploy (or push to `main` — auto-deploys).

---

## 3. Backend — Render (free)

### Option A — Blueprint (easiest)

1. Go to [Render Dashboard → New Blueprint](https://dashboard.render.com/select-repo?type=blueprint)
2. Connect GitHub → select **Fraeiy/sphere-perps**
3. Render reads `render.yaml` automatically
4. When prompted, paste your **Neon `DATABASE_URL`**
5. Click **Apply** → wait for deploy (~5 min)
6. Copy your service URL (e.g. `https://sphere-perps-api.onrender.com`)

### Option B — Manual web service

1. [Render Dashboard → New Web Service](https://dashboard.render.com/create?type=web)
2. Connect **Fraeiy/sphere-perps** repo
3. Settings:

| Setting | Value |
|---------|-------|
| **Name** | `sphere-perps-api` |
| **Region** | Oregon (US West) |
| **Branch** | `main` |
| **Runtime** | Node |
| **Plan** | **Free** |
| **Build Command** | `npm install && npm run db:generate -w backend && npm run build -w backend` |
| **Start Command** | `npm run db:push -w backend && npm run start -w backend` |

4. Environment variables:

```
NODE_ENV=production
PORT=4000
DATABASE_URL=<your Neon connection string>
JWT_SECRET=<random 32-char string>
CORS_ORIGIN=https://sphere-perps.vercel.app
SPHERE_ORACLE_API_KEY=sk_ddc3cfcc001e4a28ac3fad7407f99590
SPHERE_WALLET_API_URL=https://wallet-api.unicity.network
SPHERE_TREASURY_NAMETAG=sphere-perps-treasury
AI_PROVIDER=mock
```

5. Deploy → copy the `.onrender.com` URL

---

## 4. Wire frontend to backend

1. **Vercel** → Project → Settings → Environment Variables:
   - `VITE_API_URL` = `https://YOUR-SERVICE.onrender.com`
   - `VITE_WS_URL` = `wss://YOUR-SERVICE.onrender.com/ws`

2. Redeploy Vercel (Deployments → Redeploy, or `git push`)

3. Test:
   - `https://YOUR-SERVICE.onrender.com/health` → `{ "status": "ok" }`
   - https://sphere-perps.vercel.app → markets should load

---

## Other free alternatives (if Render doesn't work)

| Platform | Notes |
|----------|-------|
| [Fly.io](https://fly.io) | Free allowance; needs `fly.toml` |
| [Koyeb](https://koyeb.com) | Free nano instances |
| [Oracle Cloud](https://oracle.com/cloud/free) | Always-free VPS — more setup |

---

## Post-deploy checklist

- [ ] Backend `/health` returns OK
- [ ] Vercel env vars point to Render URL
- [ ] `CORS_ORIGIN` on Render = `https://sphere-perps.vercel.app`
- [ ] Neon password rotated (was shared in chat)
- [ ] Connect Wallet tested on production URL