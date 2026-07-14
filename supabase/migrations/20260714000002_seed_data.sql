-- Seed markets, achievements, competition, and initial market_prices rows

SET search_path TO perps, public;

INSERT INTO markets (symbol, base_asset, binance_symbol, tick_size, lot_size, min_order_size, max_leverage, maintenance_margin, initial_margin, funding_rate, sort_order, is_trending)
VALUES
  ('BTC/USD', 'BTC', 'BTCUSDT', 0.01, 0.001, 0.001, 100, 0.005, 0.01, 0.0001, 1, true),
  ('ETH/USD', 'ETH', 'ETHUSDT', 0.01, 0.001, 0.001, 100, 0.005, 0.01, 0.0001, 2, true),
  ('SOL/USD', 'SOL', 'SOLUSDT', 0.01, 0.001, 0.001, 100, 0.005, 0.01, 0.0001, 3, true),
  ('BNB/USD', 'BNB', 'BNBUSDT', 0.01, 0.001, 0.001, 100, 0.005, 0.01, 0.0001, 4, false),
  ('SUI/USD', 'SUI', 'SUIUSDT', 0.01, 0.001, 0.001, 100, 0.005, 0.01, 0.0001, 5, false),
  ('DOGE/USD', 'DOGE', 'DOGEUSDT', 0.01, 0.001, 0.001, 100, 0.005, 0.01, 0.0001, 6, false)
ON CONFLICT (symbol) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  is_trending = EXCLUDED.is_trending;

INSERT INTO market_prices (market_id, symbol, funding_rate, next_funding_at)
SELECT id, symbol, funding_rate, now() + interval '8 hours'
FROM markets
ON CONFLICT (market_id) DO NOTHING;

INSERT INTO achievements (code, name, description, category, icon, threshold)
VALUES
  ('FIRST_TRADE', 'First Trade', 'Complete your first trade', 'trading', '🎯', NULL),
  ('FIRST_PROFIT', 'First Profit', 'Close your first profitable trade', 'trading', '💰', NULL),
  ('TEN_WINS', '10 Winning Trades', 'Win 10 trades', 'trading', '🏆', 10),
  ('HUNDRED_TRADES', '100 Trades', 'Complete 100 trades', 'milestone', '💎', 100),
  ('DIAMOND_HANDS', 'Diamond Hands', 'Hold a position for 7+ days', 'holding', '💎', NULL),
  ('HIGH_LEVERAGE', 'High Leverage', 'Trade with 50x+ leverage', 'risk', '⚡', NULL),
  ('CONSISTENT_TRADER', 'Consistent Trader', 'Trade 7 days in a row', 'streak', '🔥', NULL)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  threshold = EXCLUDED.threshold;

INSERT INTO competitions (id, name, description, status, start_at, end_at, prize_pool, rules)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Launch Week Trading Competition',
  'Top traders by PnL win UCT rewards',
  'ACTIVE',
  now(),
  now() + interval '7 days',
  10000,
  '{"metric":"pnl","minTrades":5}'::jsonb
)
ON CONFLICT (id) DO NOTHING;