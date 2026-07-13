import { Router } from 'express';
import type { PriceFeedService } from '../services/price-feed.js';

export function createPricesRouter(priceFeed: PriceFeedService) {
  const router = Router();

  router.get('/tickers', (_req, res) => {
    res.json(priceFeed.getAllTickers());
  });

  router.get('/:symbol', (req, res) => {
    const ticker = priceFeed.getTicker(req.params.symbol);
    if (!ticker) return res.status(404).json({ error: 'Ticker not found' });
    res.json(ticker);
  });

  router.get('/:symbol/candles', async (req, res) => {
    const { interval = '1h', limit = '500' } = req.query;
    const candles = await priceFeed.fetchCandles(
      req.params.symbol,
      interval as string,
      parseInt(limit as string, 10),
    );
    res.json(candles);
  });

  return router;
}