import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { D } from '../lib/decimal.js';
import { LeaderboardService } from '../services/leaderboard.js';

export const adminRouter = Router();
adminRouter.use(authMiddleware, adminMiddleware);

adminRouter.get('/dashboard', async (_req, res) => {
  const [users, deposits, withdrawals, positions, trades, system] = await Promise.all([
    prisma.user.count(),
    prisma.deposit.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.withdrawal.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.position.count({ where: { status: 'OPEN' } }),
    prisma.trade.count(),
    prisma.systemSettings.findUnique({ where: { id: 'global' } }),
  ]);

  res.json({
    users,
    openPositions: positions,
    totalTrades: trades,
    deposits: { count: deposits._count, volume: deposits._sum.amount },
    withdrawals: { count: withdrawals._count, volume: withdrawals._sum.amount },
    system,
    health: 'healthy',
  });
});

adminRouter.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    include: { balance: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
    skip: parseInt((req.query.skip as string) ?? '0', 10),
  });
  res.json(users);
});

adminRouter.get('/deposits', async (_req, res) => {
  const deposits = await prisma.deposit.findMany({
    include: { user: { select: { nametag: true, chainPubkey: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(deposits);
});

adminRouter.get('/withdrawals', async (_req, res) => {
  const withdrawals = await prisma.withdrawal.findMany({
    include: { user: { select: { nametag: true, chainPubkey: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(withdrawals);
});

adminRouter.get('/markets', async (_req, res) => {
  const markets = await prisma.market.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(markets);
});

adminRouter.post('/markets', async (req, res) => {
  const schema = z.object({
    symbol: z.string(),
    baseAsset: z.string(),
    binanceSymbol: z.string(),
    tickSize: z.number(),
    lotSize: z.number(),
    minOrderSize: z.number(),
    maxLeverage: z.number().optional(),
    maintenanceMargin: z.number().optional(),
    fundingRate: z.number().optional(),
  });

  try {
    const data = schema.parse(req.body);
    const market = await prisma.market.create({
      data: {
        symbol: data.symbol,
        baseAsset: data.baseAsset,
        binanceSymbol: data.binanceSymbol,
        tickSize: D(data.tickSize),
        lotSize: D(data.lotSize),
        minOrderSize: D(data.minOrderSize),
        maxLeverage: data.maxLeverage ?? 100,
        maintenanceMargin: data.maintenanceMargin ? D(data.maintenanceMargin) : undefined,
        fundingRate: data.fundingRate ? D(data.fundingRate) : undefined,
      },
    });
    res.status(201).json(market);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

adminRouter.patch('/markets/:id', async (req, res) => {
  const { isActive, maxLeverage, fundingRate, isTrending } = req.body;
  const market = await prisma.market.update({
    where: { id: req.params.id },
    data: {
      isActive,
      maxLeverage,
      fundingRate: fundingRate !== undefined ? D(fundingRate) : undefined,
      isTrending,
    },
  });
  res.json(market);
});

adminRouter.patch('/settings', async (req, res) => {
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global', ...req.body },
    update: req.body,
  });
  res.json(settings);
});

adminRouter.post('/competitions', async (req, res) => {
  const competition = await prisma.competition.create({ data: req.body });
  res.status(201).json(competition);
});

adminRouter.get('/competitions', async (_req, res) => {
  const competitions = await prisma.competition.findMany({ orderBy: { startAt: 'desc' } });
  res.json(competitions);
});

adminRouter.post('/leaderboard/refresh', async (req, res) => {
  const period = (req.body.period ?? 'daily') as 'daily' | 'weekly' | 'monthly';
  const count = await LeaderboardService.refresh(period);
  res.json({ refreshed: count });
});

adminRouter.get('/logs', async (_req, res) => {
  res.json({
    logs: [
      { level: 'info', message: 'System operational', timestamp: new Date().toISOString() },
    ],
  });
});