import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { D, toNumber } from '../lib/decimal.js';
import { SphereService } from '../services/sphere.js';
import { NotificationService } from '../services/notification.js';

export const withdrawalsRouter = Router();
withdrawalsRouter.use(authMiddleware);

withdrawalsRouter.post('/', async (req, res) => {
  const schema = z.object({
    amount: z.number().positive(),
    recipientAddress: z.string().min(1),
  });

  try {
    const { amount, recipientAddress } = schema.parse(req.body);

    const system = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
    if (system && !system.withdrawalEnabled) {
      return res.status(403).json({ error: 'Withdrawals are currently disabled' });
    }

    const balance = await prisma.balance.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!balance || toNumber(balance.available) < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId: req.user!.userId,
        amount: D(amount),
        recipientAddress,
        status: 'PROCESSING',
      },
    });

    await prisma.balance.update({
      where: { userId: req.user!.userId },
      data: {
        available: { decrement: D(amount) },
        totalWithdrawn: { increment: D(amount) },
      },
    });

    const amountBaseUnits = String(Math.floor(amount * 1_000_000));
    const transfer = await SphereService.processWithdrawal(recipientAddress, amountBaseUnits);

    const completed = await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: 'COMPLETED',
        sphereTransferId: transfer.transferId,
        completedAt: new Date(),
      },
    });

    await NotificationService.notify(req.user!.userId, {
      type: 'WITHDRAWAL_COMPLETE',
      title: 'Withdrawal Complete',
      message: `${amount} UCT sent to ${recipientAddress}`,
      data: { withdrawalId: completed.id },
    });

    res.status(201).json(completed);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

withdrawalsRouter.get('/', async (req, res) => {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(withdrawals);
});