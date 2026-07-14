# Deployment Guide

## Architecture (Supabase + Vercel)

| Service | Platform | Cost |
|---------|----------|------|
| Frontend | **Vercel** | Free |
| API + Trading Engine | **Supabase Edge Functions** | Free tier |
| Database + Realtime | **Supabase Postgres** | Free tier |
| Price/Liquidation Cron | **GitHub Actions** (1 min) | Free |

> **No Render or Railway required.** Backend runs on Supabase Edge Functions, same pattern as `sphere-2048` and `sphere-predict`.

---

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or reuse an existing one)
2. Install CLI: `npm install -g supabase` (or use `npx supabase`)
3. From repo root:

```powershell
cd sphere-perps
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy platform
supabase functions deploy process-markets
```

4. Set Edge Function secrets (Dashboard → Edge Functions → Secrets, or CLI):

```
JWT_SECRET=<random 32+ char string>
FRONTEND_URL=https://sphere-perps.vercel.app
SPHERE_TREASURY_NAMETAG=sphere-perps-treasury
CRON_SECRET=<random string for cron auth>
AI_PROVIDER=mock
ADMIN_WALLET_PUBKEYS=<your wallet pubkey for admin>
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are injected automatically by Supabase.

---

## 2. Cron — trading engine

The `process-markets` function fetches Binance prices, updates liquidations, and fills limit/stop orders.

**Option A — GitHub Actions** (included in `.github/workflows/process-markets.yml`)

Add repo secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `CRON_SECRET` (same value as Supabase secret)

**Option B — Supabase Dashboard**

Project → Edge Functions → `process-markets` → Schedules → every 1 minute, header `x-cron-secret: YOUR_CRON_SECRET`

---

## 3. Frontend — Vercel

**Live:** https://sphere-perps.vercel.app

Set environment variables in Vercel → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SPHERE_WALLET_URL=https://sphere.unicity.network
```

Redeploy after setting vars.

---

## 4. Verify

1. `GET https://YOUR_PROJECT.supabase.co/functions/v1/platform/health`  
   Headers: `apikey: <anon-key>`, `Authorization: Bearer <anon-key>`
2. `POST .../functions/v1/process-markets` with `x-cron-secret` header → `{ "ok": true }`
3. https://sphere-perps.vercel.app → markets load, Connect Wallet works

---

## Local development

```powershell
# Terminal 1 — Supabase local (optional)
supabase start
supabase functions serve

# Terminal 2 — Frontend
cd frontend
# .env.local:
# VITE_SUPABASE_URL=http://127.0.0.1:54321
# VITE_SUPABASE_ANON_KEY=<from supabase status>
npm run dev
```

Legacy Express backend in `backend/` still works locally with Neon if needed — set `VITE_API_URL=http://localhost:4000` instead of Supabase vars.

---

## Post-deploy checklist

- [ ] `supabase db push` applied (markets seeded)
- [ ] `platform` + `process-markets` functions deployed
- [ ] Cron running (GitHub Action or Supabase schedule)
- [ ] Vercel `VITE_SUPABASE_*` env vars set
- [ ] Connect Wallet tested on production URL
- [ ] Realtime: prices update on Trade page without refresh

---

## Legacy Render path (optional)

The `backend/` Express server and `render.yaml` remain in the repo if you prefer a always-on WebSocket server. Supabase is the recommended production path.