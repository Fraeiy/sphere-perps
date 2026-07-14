-- Enable Realtime for live price feeds and notifications

ALTER PUBLICATION supabase_realtime ADD TABLE market_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Public read on market prices (anon can subscribe)
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_prices_public_read"
  ON market_prices FOR SELECT
  TO anon, authenticated
  USING (true);