import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { D } from '../lib/decimal.js';
import { NotificationService } from '../services/notification.js';

export const depositsRouter = Router();
depositsRouter.use(authMiddleware);

depositsRouter.post('/', async (req, res) => {
  const schema = z.object({
    amount: z.number().positive(),
    sphereTransferId: z.string().optional(),
    txHash: z.string().optional(),
  });

  try {
    const { amount, sphereTransferId, txHash } = schema.parse(req.body);

    const system = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
    if (system && !system.depositEnabled) {
      return res.status(403).json({ error: 'Deposits are currently disabled' });
    }

    const deposit = await prisma.$transaction(async (tx) => {
      const d = await tx.deposit.create({
        data: {
          userId: req.user!.userId,
          amount: D(amount),
          sphereTransferId,
          txHash,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      await tx.balance.upsert({
        where: { userId: req.user!.userId },
        create: {
          userId: req.user!.userId,
          available: D(amount),
          totalDeposited: D(amount),
        },
        update: {
          available: { increment: D(amount) },
          totalDeposited: { increment: D(amount) },
        },
      });

      return d;
    });

    await NotificationService.notify(req.user!.userId, {
      type: 'DEPOSIT_COMPLETE',
      title: 'Deposit Complete',
      message: `${amount} UCT deposited successfully`,
      data: { depositId: deposit.id },
    });

    res.status(201).json(deposit);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

depositsRouter.get('/', async (req, res) => {
  const deposits = await prisma.deposit.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(deposits);
});