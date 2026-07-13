import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { LeaderboardService } from '../services/leaderboard.js';
import { prisma } from '../lib/prisma.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/:period', async (req, res) => {
  const { period } = req.params;
  const sortBy = (req.query.sortBy as 'roi' | 'pnl' | 'winRate' | 'volume' | 'consistency') ?? 'pnl';
  const entries = await LeaderboardService.getLeaderboard(period, sortBy);
  res.json(entries);
});

leaderboardRouter.get('/referrals/top', async (_req, res) => {
  const entries = await LeaderboardService.getReferralLeaderboard();
  res.json(entries);
});

leaderboardRouter.get('/user/referrals', authMiddleware, async (req, res) => {
  const referrals = await prisma.user.findMany({
    where: { referredById: req.user!.userId },
    select: { id: true, nametag: true, chainPubkey: true, createdAt: true },
  });

  const rewards = await prisma.referralReward.findMany({
    where: { referrerId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { referralCode: true },
  });

  res.json({ referralCode: user?.referralCode, referrals, rewards });
});