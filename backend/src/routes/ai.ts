import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { AiService } from '../services/ai.js';
import { prisma } from '../lib/prisma.js';
import { toNumber } from '../lib/decimal.js';
import type { PriceFeedService } from '../services/price-feed.js';

export function createAiRouter(priceFeed: PriceFeedService) {
  const router = Router();
  router.use(authMiddleware);

  router.get('/market-summary/:symbol', async (req, res) => {
    const ticker = priceFeed.getTicker(req.params.symbol);
    if (!ticker) return res.status(404).json({ error: 'Market not found' });

    const summary = await AiService.generateMarketSummary({
      symbol: ticker.symbol,
      price: ticker.price,
      change24h: ticker.change24h,
      volume24h: ticker.volume24h,
      fundingRate: ticker.fundingRate,
    });

    res.json(summary);
  });

  router.post('/risk-score', async (req, res) => {
    const schema = z.object({
      symbol: z.string(),
      side: z.string(),
      leverage: z.number(),
      size: z.number(),
      price: z.number().optional(),
    });

    try {
      const input = schema.parse(req.body);
      const ticker = priceFeed.getTicker(input.symbol);
      const price = input.price ?? ticker?.price ?? 0;

      const balance = await prisma.balance.findUnique({
        where: { userId: req.user!.userId },
      });

      const assessment = await AiService.assessTradeRisk({
        ...input,
        price,
        change24h: ticker?.change24h ?? 0,
        balance: toNumber(balance?.available ?? 0),
      });

      res.json(assessment);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/news-summary', async (_req, res) => {
    const markets = await prisma.market.findMany({
      where: { isActive: true },
      take: 6,
    });
    const summary = await AiService.generateNewsSummary(markets.map((m) => m.symbol));
    res.json({ summary, symbols: markets.map((m) => m.symbol) });
  });

  router.get('/journal', async (req, res) => {
    const journals = await prisma.tradeJournal.findMany({
      where: { userId: req.user!.userId },
      include: { position: { include: { market: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(journals);
  });

  return router;
}