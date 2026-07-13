# Fix Render "invalid repository"

This error means Render cannot access `github.com/Fraeiy/sphere-perps`.

## Step 1 — Fix GitHub connection

1. Go to https://dashboard.render.com/u/settings#integrations
2. Under **GitHub**, click **Connect account** or **Configure**
3. Make sure you're logged into GitHub as **Fraeiy** (the repo owner)
4. When GitHub asks which repos Render can access:
   - Choose **Only select repositories**
   - Add **Fraeiy/sphere-perps**
5. Save

## Step 2 — Delete the broken Blueprint

1. Render Dashboard → **Blueprints**
2. Delete the failed `sphere-perps` blueprint (if it exists)

## Step 3 — Deploy manually (skip Blueprint)

1. Go to https://dashboard.render.com/create?type=web
2. **Build and deploy from a Git repository** → Connect if needed
3. Select repository: **Fraeiy / sphere-perps**
4. Settings:

| Field | Value |
|-------|-------|
| Name | `sphere-perps-api` |
| Region | Oregon |
| Branch | `main` |
| Root Directory | *(leave blank)* |
| Runtime | Node |
| Plan | **Free** |
| Build Command | `npm install && npm run db:generate -w backend && npm run build -w backend` |
| Start Command | `npm run db:push -w backend && npm run start -w backend` |

5. Environment variables — add `DATABASE_URL` (Neon string) plus others from `render.yaml`

6. Click **Create Web Service**

## Step 4 — After deploy

Copy URL → update Vercel:
```
VITE_API_URL=https://sphere-perps-api.onrender.com
VITE_WS_URL=wss://sphere-perps-api.onrender.com/ws
```

## Common causes

| Cause | Fix |
|-------|-----|
| Wrong GitHub account on Render | Connect Fraeiy account |
| Repo not in allowed list | Grant access to sphere-perps in GitHub app settings |
| Private repo without access | Add repo to Render GitHub app |
| Blueprint created before repo linked | Use manual web service instead |