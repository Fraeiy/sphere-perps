-- Sphere Perps — Supabase schema (migrated from Prisma)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE margin_mode AS ENUM ('CROSS', 'ISOLATED');
CREATE TYPE position_side AS ENUM ('LONG', 'SHORT');
CREATE TYPE order_type AS ENUM ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT');
CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
CREATE TYPE order_status AS ENUM ('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');
CREATE TYPE position_status AS ENUM ('OPEN', 'CLOSED', 'LIQUIDATED');
CREATE TYPE deposit_status AS ENUM ('PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED');
CREATE TYPE withdrawal_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE notification_type AS ENUM (
  'LIQUIDATION_WARNING', 'ORDER_FILLED', 'TP_HIT', 'SL_HIT',
  'DEPOSIT_COMPLETE', 'WITHDRAWAL_COMPLETE', 'REFERRAL_REWARD',
  'COMPETITION_UPDATE', 'ACHIEVEMENT_UNLOCKED', 'SYSTEM'
);
CREATE TYPE competition_status AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED');

-- Users
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_pubkey    TEXT NOT NULL UNIQUE,
  direct_address  TEXT,
  nametag         TEXT,
  referral_code   TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  referred_by_id  UUID REFERENCES users(id),
  is_admin        BOOLEAN NOT NULL DEFAULT false,
  is_banned       BOOLEAN NOT NULL DEFAULT false,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_nametag ON users(nametag);
CREATE INDEX idx_users_referral_code ON users(referral_code);

CREATE TABLE wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chain_pubkey    TEXT NOT NULL UNIQUE,
  direct_address  TEXT,
  nametag         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE balances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available        NUMERIC(24, 8) NOT NULL DEFAULT 0,
  locked           NUMERIC(24, 8) NOT NULL DEFAULT 0,
  total_deposited  NUMERIC(24, 8) NOT NULL DEFAULT 0,
  total_withdrawn  NUMERIC(24, 8) NOT NULL DEFAULT 0,
  realized_pnl     NUMERIC(24, 8) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE markets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol                TEXT NOT NULL UNIQUE,
  base_asset            TEXT NOT NULL,
  quote_asset           TEXT NOT NULL DEFAULT 'USD',
  binance_symbol        TEXT NOT NULL UNIQUE,
  tick_size             NUMERIC(24, 8) NOT NULL,
  lot_size              NUMERIC(24, 8) NOT NULL,
  min_order_size        NUMERIC(24, 8) NOT NULL,
  max_leverage          INTEGER NOT NULL DEFAULT 100,
  maintenance_margin    NUMERIC(10, 6) NOT NULL DEFAULT 0.005,
  initial_margin        NUMERIC(10, 6) NOT NULL DEFAULT 0.01,
  funding_rate          NUMERIC(10, 8) NOT NULL DEFAULT 0.0001,
  funding_interval_hours INTEGER NOT NULL DEFAULT 8,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  is_trending           BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE positions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id           UUID NOT NULL REFERENCES markets(id),
  side                position_side NOT NULL,
  margin_mode         margin_mode NOT NULL DEFAULT 'CROSS',
  leverage            INTEGER NOT NULL,
  size                NUMERIC(24, 8) NOT NULL,
  entry_price         NUMERIC(24, 8) NOT NULL,
  mark_price          NUMERIC(24, 8) NOT NULL,
  liquidation_price   NUMERIC(24, 8) NOT NULL,
  margin_used         NUMERIC(24, 8) NOT NULL,
  maintenance_margin  NUMERIC(24, 8) NOT NULL,
  unrealized_pnl      NUMERIC(24, 8) NOT NULL DEFAULT 0,
  realized_pnl        NUMERIC(24, 8) NOT NULL DEFAULT 0,
  roe                 NUMERIC(10, 4) NOT NULL DEFAULT 0,
  stop_loss           NUMERIC(24, 8),
  take_profit         NUMERIC(24, 8),
  status              position_status NOT NULL DEFAULT 'OPEN',
  closed_at           TIMESTAMPTZ,
  close_price         NUMERIC(24, 8),
  close_reason        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_positions_user_status ON positions(user_id, status);
CREATE INDEX idx_positions_market_status ON positions(market_id, status);

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id       UUID NOT NULL REFERENCES markets(id),
  type            order_type NOT NULL,
  side            order_side NOT NULL,
  margin_mode     margin_mode NOT NULL DEFAULT 'CROSS',
  leverage        INTEGER NOT NULL,
  size            NUMERIC(24, 8) NOT NULL,
  price           NUMERIC(24, 8),
  stop_price      NUMERIC(24, 8),
  filled_size     NUMERIC(24, 8) NOT NULL DEFAULT 0,
  avg_fill_price  NUMERIC(24, 8),
  status          order_status NOT NULL DEFAULT 'PENDING',
  reduce_only     BOOLEAN NOT NULL DEFAULT false,
  client_order_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_orders_market_status ON orders(market_id, status);

CREATE TABLE trades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id     UUID NOT NULL REFERENCES markets(id),
  position_id   UUID REFERENCES positions(id),
  order_id      UUID REFERENCES orders(id),
  side          order_side NOT NULL,
  size          NUMERIC(24, 8) NOT NULL,
  price         NUMERIC(24, 8) NOT NULL,
  fee           NUMERIC(24, 8) NOT NULL DEFAULT 0,
  realized_pnl  NUMERIC(24, 8) NOT NULL DEFAULT 0,
  is_maker      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trades_user_created ON trades(user_id, created_at);
CREATE INDEX idx_trades_market_created ON trades(market_id, created_at);

CREATE TABLE funding_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id   UUID NOT NULL REFERENCES markets(id),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  rate        NUMERIC(10, 8) NOT NULL,
  payment     NUMERIC(24, 8) NOT NULL,
  mark_price  NUMERIC(24, 8) NOT NULL,
  size        NUMERIC(24, 8) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funding_payments_user_created ON funding_payments(user_id, created_at);

CREATE TABLE deposits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount             NUMERIC(24, 8) NOT NULL,
  tx_hash            TEXT,
  sphere_transfer_id TEXT,
  status             deposit_status NOT NULL DEFAULT 'PENDING',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX idx_deposits_user_status ON deposits(user_id, status);

CREATE TABLE withdrawals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount              NUMERIC(24, 8) NOT NULL,
  recipient_address   TEXT NOT NULL,
  sphere_transfer_id  TEXT,
  status              withdrawal_status NOT NULL DEFAULT 'PENDING',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_withdrawals_user_status ON withdrawals(user_id, status);

CREATE TABLE leaderboard_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  roi          NUMERIC(10, 4) NOT NULL DEFAULT 0,
  pnl          NUMERIC(24, 8) NOT NULL DEFAULT 0,
  win_rate     NUMERIC(10, 4) NOT NULL DEFAULT 0,
  volume       NUMERIC(24, 8) NOT NULL DEFAULT 0,
  trade_count  INTEGER NOT NULL DEFAULT 0,
  consistency  NUMERIC(10, 4) NOT NULL DEFAULT 0,
  rank         INTEGER,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period, period_start)
);

CREATE INDEX idx_leaderboard_period_rank ON leaderboard_entries(period, period_start, rank);

CREATE TABLE competitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  status      competition_status NOT NULL DEFAULT 'UPCOMING',
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  prize_pool  NUMERIC(24, 8) NOT NULL DEFAULT 0,
  rules       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referral_rewards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL,
  amount      NUMERIC(24, 8) NOT NULL,
  type        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_rewards_referrer ON referral_rewards(referrer_id);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  data       JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

CREATE TABLE achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT,
  category    TEXT NOT NULL,
  threshold   INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  streak         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, achievement_id)
);

CREATE TABLE settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  default_leverage    INTEGER NOT NULL DEFAULT 10,
  default_margin_mode margin_mode NOT NULL DEFAULT 'CROSS',
  favorite_markets    TEXT[] NOT NULL DEFAULT '{}',
  recent_markets      TEXT[] NOT NULL DEFAULT '{}',
  notifications       JSONB NOT NULL DEFAULT '{}',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trade_journals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id UUID NOT NULL UNIQUE REFERENCES positions(id) ON DELETE CASCADE,
  summary     TEXT NOT NULL,
  analysis    TEXT NOT NULL,
  risk_score  INTEGER,
  suggestions JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE price_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES markets(id),
  price           NUMERIC(24, 8) NOT NULL,
  mark_price      NUMERIC(24, 8) NOT NULL,
  index_price     NUMERIC(24, 8) NOT NULL,
  change_24h      NUMERIC(10, 4) NOT NULL DEFAULT 0,
  volume_24h      NUMERIC(24, 8) NOT NULL DEFAULT 0,
  high_24h        NUMERIC(24, 8) NOT NULL DEFAULT 0,
  low_24h         NUMERIC(24, 8) NOT NULL DEFAULT 0,
  funding_rate    NUMERIC(10, 8) NOT NULL DEFAULT 0,
  next_funding_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_snapshots_market_created ON price_snapshots(market_id, created_at);

-- Live prices for Realtime + trading engine
CREATE TABLE market_prices (
  market_id       UUID PRIMARY KEY REFERENCES markets(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL UNIQUE,
  price           NUMERIC(24, 8) NOT NULL DEFAULT 0,
  mark_price      NUMERIC(24, 8) NOT NULL DEFAULT 0,
  change_24h      NUMERIC(10, 4) NOT NULL DEFAULT 0,
  volume_24h      NUMERIC(24, 8) NOT NULL DEFAULT 0,
  high_24h        NUMERIC(24, 8) NOT NULL DEFAULT 0,
  low_24h         NUMERIC(24, 8) NOT NULL DEFAULT 0,
  funding_rate    NUMERIC(10, 8) NOT NULL DEFAULT 0,
  next_funding_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_settings (
  id                 TEXT PRIMARY KEY DEFAULT 'global',
  trading_enabled    BOOLEAN NOT NULL DEFAULT true,
  max_leverage       INTEGER NOT NULL DEFAULT 100,
  maintenance_mode   BOOLEAN NOT NULL DEFAULT false,
  deposit_enabled    BOOLEAN NOT NULL DEFAULT true,
  withdrawal_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_nonces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce        TEXT NOT NULL UNIQUE,
  chain_pubkey TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Engine heartbeat (cron health)
CREATE TABLE engine_status (
  id         TEXT PRIMARY KEY DEFAULT 'global',
  last_run_at TIMESTAMPTZ,
  markets_processed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_settings (id) VALUES ('global') ON CONFLICT DO NOTHING;
INSERT INTO engine_status (id) VALUES ('global') ON CONFLICT DO NOTHING;