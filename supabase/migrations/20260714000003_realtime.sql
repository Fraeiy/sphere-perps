-- Enable Realtime for live price feeds and notifications

ALTER PUBLICATION supabase_realtime ADD TABLE perps.market_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE perps.notifications;

ALTER TABLE perps.market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_prices_public_read"
  ON perps.market_prices FOR SELECT
  TO anon, authenticated
  USING (true);