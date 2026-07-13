import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import type { TradingEngine } from '../services/trading-engine.js';
import { RiskEngine } from '../services/risk-engine.js';
import { toNumber } from '../lib/decimal.js';
import type { PriceFeedService } from '../services/price-feed.js';

export function createPositionsRouter(tradingEngine: TradingEngine, priceFeed: PriceFeedService) {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', async (req, res) => {
    const { status = 'OPEN' } = req.query;
    const positions = await prisma.position.findMany({
      where: {
        userId: req.user!.userId,
        status: status as 'OPEN' | 'CLOSED' | 'LIQUIDATED',
      },
      include: { market: true },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = positions.map((p) => {
      const markPrice = priceFeed.getMarkPrice(p.market.symbol) ?? toNumber(p.markPrice);
      const metrics = RiskEngine.calculateMetrics({
        side: p.side,
        size: toNumber(p.size),
        entryPrice: toNumber(p.entryPrice),
        markPrice,
        leverage: p.leverage,
        marginMode: p.marginMode,
        maintenanceMarginRate: toNumber(p.market.maintenanceMargin),
      });
      return { ...p, liveMarkPrice: markPrice, liveMetrics: metrics };
    });

    res.json(enriched);
  });

  router.post('/:id/close', async (req, res) => {
    try {
      const { size } = req.body;
      const result = await tradingEngine.closePosition(req.params.id, req.user!.userId, size);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const schema = z.object({
      stopLoss: z.number().positive().optional().nullable(),
      takeProfit: z.number().positive().optional().nullable(),
      leverage: z.number().int().min(1).max(100).optional(),
    });

    try {
      const data = schema.parse(req.body);
      const position = await prisma.position.update({
        where: { id: req.params.id, userId: req.user!.userId },
        data: {
          stopLoss: data.stopLoss !== undefined ? data.stopLoss : undefined,
          takeProfit: data.takeProfit !== undefined ? data.takeProfit : undefined,
          leverage: data.leverage,
        },
        include: { market: true },
      });
      res.json(position);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}