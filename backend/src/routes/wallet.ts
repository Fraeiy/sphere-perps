import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { toNumber } from '../lib/decimal.js';
import { SphereService } from '../services/sphere.js';

export const walletRouter = Router();

walletRouter.use(authMiddleware);

walletRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { balance: true, wallet: true },
  });

  const pendingDeposits = await prisma.deposit.count({
    where: { userId: req.user!.userId, status: { in: ['PENDING', 'CONFIRMING'] } },
  });

  const pendingWithdrawals = await prisma.withdrawal.count({
    where: { userId: req.user!.userId, status: { in: ['PENDING', 'PROCESSING'] } },
  });

  res.json({
    wallet: user?.wallet,
    balance: user?.balance,
    tradingBalance: toNumber(user?.balance?.available ?? 0),
    lockedBalance: toNumber(user?.balance?.locked ?? 0),
    pendingDeposits,
    pendingWithdrawals,
    treasuryAddress: await SphereService.getTreasuryAddress(),
    treasuryNametag: SphereService.getTreasuryNametag(),
  });
});

walletRouter.get('/transactions', async (req, res) => {
  const [deposits, withdrawals] = await Promise.all([
    prisma.deposit.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.withdrawal.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  res.json({ deposits, withdrawals });
});