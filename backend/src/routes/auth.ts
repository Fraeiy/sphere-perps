import { Router } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { SphereService } from '../services/sphere.js';
import { signToken, authMiddleware } from '../middleware/auth.js';
import { config } from '../config.js';

export const authRouter = Router();

authRouter.post('/nonce', async (_req, res) => {
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.authNonce.create({
    data: { nonce, expiresAt },
  });

  res.json({ nonce, expiresAt });
});

authRouter.post('/verify', async (req, res) => {
  const { nonce, signature, publicKey, message, directAddress, nametag, referralCode } = req.body;

  if (!nonce || !signature || !publicKey || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const authNonce = await prisma.authNonce.findUnique({ where: { nonce } });
  if (!authNonce || authNonce.usedAt || authNonce.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired nonce' });
  }

  // Verify the exact message the user signed (must include matching nonce)
  if (!String(message).includes(nonce)) {
    return res.status(400).json({ error: 'Message does not match nonce' });
  }

  const valid = SphereService.verifyAuthSignature(String(message), signature, publicKey);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  await prisma.authNonce.update({
    where: { id: authNonce.id },
    data: { usedAt: new Date(), chainPubkey: publicKey },
  });

  let user = await prisma.user.findUnique({ where: { chainPubkey: publicKey } });
  const isAdmin = config.adminWalletPubkeys.includes(publicKey);

  if (!user) {
    let referredById: string | undefined;
    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      referredById = referrer?.id;
    }

    user = await prisma.user.create({
      data: {
        chainPubkey: publicKey,
        directAddress,
        nametag,
        referredById,
        isAdmin,
        wallet: {
          create: { chainPubkey: publicKey, directAddress, nametag },
        },
        balance: { create: {} },
        settings: { create: {} },
      },
    });

    if (referredById) {
      await prisma.referralReward.create({
        data: {
          referrerId: referredById,
          referredId: user.id,
          amount: 10,
          type: 'signup',
        },
      });
    }
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        directAddress: directAddress ?? user.directAddress,
        nametag: nametag ?? user.nametag,
        lastLoginAt: new Date(),
        isAdmin: isAdmin || user.isAdmin,
      },
    });
  }

  const token = signToken({ userId: user.id, chainPubkey: publicKey });

  res.json({
    token,
    user: {
      id: user.id,
      chainPubkey: user.chainPubkey,
      directAddress: user.directAddress,
      nametag: user.nametag,
      referralCode: user.referralCode,
      isAdmin: user.isAdmin,
    },
  });
});

authRouter.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { balance: true, wallet: true, settings: true },
  });
  res.json(user);
});