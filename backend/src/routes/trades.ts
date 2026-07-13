import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { toNumber } from '../lib/decimal.js';

export const tradesRouter = Router();
tradesRouter.use(authMiddleware);

tradesRouter.get('/', async (req, res) => {
  const trades = await prisma.trade.findMany({
    where: { userId: req.user!.userId },
    include: { market: true, position: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(trades);
});

tradesRouter.get('/funding', async (req, res) => {
  const payments = await prisma.fundingPayment.findMany({
    where: { userId: req.user!.userId },
    include: { market: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(payments);
});

tradesRouter.get('/journal', async (req, res) => {
  const journals = await prisma.tradeJournal.findMany({
    where: { userId: req.user!.userId },
    include: { position: { include: { market: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(journals);
});

tradesRouter.get('/stats', async (req, res) => {
  const userId = req.user!.userId;
  const trades = await prisma.trade.findMany({ where: { userId } });
  const closedPositions = await prisma.position.findMany({
    where: { userId, status: { in: ['CLOSED', 'LIQUIDATED'] } },
  });

  const wins = closedPositions.filter((p) => toNumber(p.realizedPnl) > 0);
  const losses = closedPositions.filter((p) => toNumber(p.realizedPnl) < 0);

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const pnlInPeriod = (since: Date) =>
    closedPositions
      .filter((p) => p.closedAt && p.closedAt >= since)
      .reduce((s, p) => s + toNumber(p.realizedPnl), 0);

  const balance = await prisma.balance.findUnique({ where: { userId } });
  const portfolioValue =
    toNumber(balance?.available ?? 0) + toNumber(balance?.locked ?? 0);

  const largestWin = wins.length
    ? Math.max(...wins.map((p) => toNumber(p.realizedPnl)))
    : 0;
  const largestLoss = losses.length
    ? Math.min(...losses.map((p) => toNumber(p.realizedPnl)))
    : 0;

  const avgWin =
    wins.length > 0
      ? wins.reduce((s, p) => s + toNumber(p.realizedPnl), 0) / wins.length
      : 0;
  const avgLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((s, p) => s + toNumber(p.realizedPnl), 0) / losses.length)
      : 0;

  res.json({
    portfolioValue,
    dailyPnl: pnlInPeriod(dayAgo),
    weeklyPnl: pnlInPeriod(weekAgo),
    monthlyPnl: pnlInPeriod(monthAgo),
    winRate: closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0,
    averageRR: avgLoss > 0 ? avgWin / avgLoss : 0,
    largestWin,
    largestLoss,
    sharpeRatio: null,
    totalTrades: trades.length,
    totalVolume: trades.reduce((s, t) => s + toNumber(t.size) * toNumber(t.price), 0),
  });
});