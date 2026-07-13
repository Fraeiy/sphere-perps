# Sphere Perps

A production-quality perpetual futures trading platform built on the **Unicity Sphere SDK**. Trade BTC, ETH, SOL, and more with up to 100x leverage, powered by off-chain matching with on-chain UCT settlement.

## Features

- **Sphere Wallet Auth** — Connect via Sphere Connect protocol with cryptographic sign-in
- **Perpetual Trading** — Market & limit orders, long/short, cross & isolated margin
- **Risk Engine** — Liquidation price, maintenance margin, funding payments, auto-liquidation
- **Live Market Data** — Binance Futures WebSocket price feeds with candlestick charts
- **AI Features** — Trade journal, market summaries, risk scoring, trading coach
- **Social** — Leaderboards, referrals, achievements, competitions
- **Admin Dashboard** — Market management, trading freeze, system health

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, TypeScript, TailwindCSS, shadcn/ui, React Query, Zustand |
| Charts | TradingView Lightweight Charts |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Realtime | WebSockets |
| Wallet | Unicity Sphere SDK (Connect) |
| Prices | Binance Futures API |

## Project Structure

```
sphere-perps/
├── backend/
│   ├── prisma/          # Database schema & seed
│   └── src/
│       ├── routes/      # REST API endpoints
│       ├── services/    # Trading engine, risk engine, AI, Sphere
│       └── websocket/   # Real-time price & notification hub
├── frontend/
│   └── src/
│       ├── components/  # Trading UI, wallet, layout
│       ├── pages/       # Trade, Dashboard, Leaderboard, Admin
│       ├── lib/         # API client, Sphere wallet, WebSocket
│       └── stores/      # Zustand state
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 20+
- [Sphere Wallet](https://sphere.unicity.network) (browser extension or web)
- PostgreSQL — **optional** for local dev (SQLite is the default)

### 1. Clone & Install

```bash
cd sphere-perps
npm install
```

### 2. Database Setup

PostgreSQL is required. Pick one option:

**Option A — Docker (local):**

1. **Start Docker Desktop** and wait until it shows "Running"
2. Run:

```powershell
# Windows
.\scripts\setup-db.ps1 -UseDocker
```

```bash
# Mac/Linux
docker compose up postgres -d
cd backend && npm run db:setup
```

**Option B — Neon (free cloud, no Docker):**

1. Create a free database at [neon.tech](https://neon.tech)
2. Copy the connection string into `backend/.env`:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Run:
   ```bash
   cd backend && npm run db:setup
   ```

> **Troubleshooting:** If you see `Can't reach database server at localhost:5432`, Docker Desktop is not running. Either start Docker Desktop, or use Neon (Option B).

### 3. Start Development

```bash
# From project root — starts both frontend & backend
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000
- **WebSocket**: ws://localhost:4000/ws

### 4. Connect Wallet

1. Open http://localhost:5173
2. Click **Connect Wallet**
3. Approve connection in Sphere Wallet
4. Sign the authentication message
5. Deposit UCT to start trading

## API Endpoints

| Route | Description |
|-------|-------------|
| `POST /auth/nonce` | Get auth challenge |
| `POST /auth/verify` | Verify signature & get JWT |
| `GET /markets` | List trading markets |
| `GET /prices/:symbol/candles` | OHLCV candle data |
| `POST /orders` | Place order |
| `GET /positions` | Open positions with live PnL |
| `POST /deposits` | Credit trading balance |
| `POST /withdrawals` | Withdraw UCT via Sphere |
| `GET /ai/risk-score` | AI trade risk assessment |
| `GET /leaderboard/:period` | Trading leaderboard |
| `GET /admin/dashboard` | Admin analytics |

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://sphere:sphere_dev_password@localhost:5432/sphere_perps
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
SPHERE_ORACLE_API_KEY=sk_ddc3cfcc001e4a28ac3fad7407f99590
SPHERE_TREASURY_NAMETAG=sphere-perps-treasury
SPHERE_TREASURY_MNEMONIC=          # Optional: for live withdrawals
AI_PROVIDER=mock                   # mock | openai | spacexai
ADMIN_WALLET_PUBKEYS=              # Comma-separated admin pubkeys
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=/api
VITE_WS_URL=ws://localhost:4000/ws
VITE_SPHERE_WALLET_URL=https://sphere.unicity.network
```

## Docker Deployment

```bash
docker compose up --build
```

Services:
- **postgres** — PostgreSQL on port 5432
- **backend** — API on port 4000
- **frontend** — Nginx on port 5173

## Deployment

### Frontend (Vercel)

```bash
cd frontend
vercel --prod
```

Set environment variables in Vercel dashboard.

### Backend (Railway / Render / Fly.io)

1. Connect repository
2. Set `DATABASE_URL` to Supabase/Neon PostgreSQL
3. Set all backend environment variables
4. Deploy with `npm run build && npm start`

### Database (Supabase / Neon)

Create a PostgreSQL instance and use the connection string as `DATABASE_URL`.

## Trading Engine

The platform uses an **off-chain matching engine** with on-chain settlement:

1. **Deposits/Withdrawals** — Settled via Sphere SDK UCT transfers
2. **Trading** — Matched internally against Binance mark prices
3. **Liquidation** — Automatic when maintenance margin is breached
4. **Funding** — Periodic funding rate payments every 8 hours

### Risk Calculations

- `Margin Used = Notional / Leverage`
- `Liquidation Price (Long) = Entry × (1 - 1/Leverage + MMR)`
- `Unrealized PnL = (Mark - Entry) × Size` (long)
- `ROE = Unrealized PnL / Margin Used × 100`

## Adding Markets

Markets are defined in `backend/prisma/seed.ts`. To add a new asset:

```typescript
{ symbol: 'XRP/USD', baseAsset: 'XRP', binanceSymbol: 'XRPUSDT', sortOrder: 7 }
```

Or via Admin API:

```bash
POST /admin/markets
{
  "symbol": "XRP/USD",
  "baseAsset": "XRP",
  "binanceSymbol": "XRPUSDT",
  "tickSize": 0.0001,
  "lotSize": 1,
  "minOrderSize": 1
}
```

## Future Extensions

The codebase is structured for:

- Prediction markets
- Options trading
- Copy trading & vaults
- Social trading & AI agents
- Yield products & NFT achievements
- Mobile app (React Native)

## License

MIT