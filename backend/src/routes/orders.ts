import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import type { TradingEngine } from '../services/trading-engine.js';

const placeOrderSchema = z.object({
  marketId: z.string(),
  type: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']),
  side: z.enum(['BUY', 'SELL']),
  size: z.number().positive(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  leverage: z.number().int().min(1).max(100),
  marginMode: z.enum(['CROSS', 'ISOLATED']).optional(),
  reduceOnly: z.boolean().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});

export function createOrdersRouter(tradingEngine: TradingEngine) {
  const router = Router();
  router.use(authMiddleware);

  router.post('/', async (req, res) => {
    try {
      const input = placeOrderSchema.parse(req.body);
      const result = await tradingEngine.placeOrder({
        userId: req.user!.userId,
        ...input,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/open', async (req, res) => {
    const orders = await prisma.order.findMany({
      where: {
        userId: req.user!.userId,
        status: { in: ['OPEN', 'PENDING', 'PARTIALLY_FILLED'] },
      },
      include: { market: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  });

  router.get('/', async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.userId },
      include: { market: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(orders);
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await tradingEngine.cancelOrder(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}