import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { toNumber } from '../lib/decimal.js';
import type { PriceFeedService } from '../services/price-feed.js';

export function createMarketsRouter(priceFeed: PriceFeedService) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const markets = await prisma.market.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const enriched = markets.map((m) => {
      const ticker = priceFeed.getTicker(m.symbol);
      return {
        ...m,
        price: ticker?.price ?? 0,
        change24h: ticker?.change24h ?? 0,
        volume24h: ticker?.volume24h ?? 0,
        fundingRate: ticker?.fundingRate ?? toNumber(m.fundingRate),
        nextFundingAt: ticker?.nextFundingAt,
      };
    });

    res.json(enriched);
  });

  router.get('/trending', async (_req, res) => {
    const markets = await prisma.market.findMany({
      where: { isActive: true, isTrending: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(markets);
  });

  router.get('/:symbol', async (req, res) => {
    const market = await prisma.market.findUnique({
      where: { symbol: req.params.symbol },
    });
    if (!market) return res.status(404).json({ error: 'Market not found' });

    const ticker = priceFeed.getTicker(market.symbol);
    res.json({ ...market, ticker });
  });

  return router;
}