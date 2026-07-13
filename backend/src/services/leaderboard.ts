import { prisma } from '../lib/prisma.js';
import { AchievementService } from './achievement.js';
import { toNumber } from '../lib/decimal.js';

export class LeaderboardService {
  static async refresh(period: 'daily' | 'weekly' | 'monthly') {
    const periodStart = this.getPeriodStart(period);
    const periodEnd = new Date();

    const users = await prisma.user.findMany({
      where: { isBanned: false },
      include: { balance: true },
    });

    const entries = [];

    for (const user of users) {
      const stats = await AchievementService.getLeaderboardStats(user.id, period);
      const balance = toNumber(user.balance?.available ?? 0) + toNumber(user.balance?.locked ?? 0);
      const roi = balance > 0 ? (stats.pnl / balance) * 100 : 0;

      entries.push({
        userId: user.id,
        period,
        periodStart,
        periodEnd,
        roi,
        pnl: stats.pnl,
        winRate: stats.winRate,
        volume: stats.volume,
        tradeCount: stats.tradeCount,
        consistency: stats.winRate > 50 ? stats.winRate : stats.winRate * 0.5,
      });
    }

    entries.sort((a, b) => b.pnl - a.pnl);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      await prisma.leaderboardEntry.upsert({
        where: {
          userId_period_periodStart: {
            userId: entry.userId,
            period,
            periodStart,
          },
        },
        create: { ...entry, rank: i + 1 },
        update: { ...entry, rank: i + 1 },
      });
    }

    return entries.length;
  }

  static async getLeaderboard(
    period: string,
    sortBy: 'roi' | 'pnl' | 'winRate' | 'volume' | 'consistency' = 'pnl',
    limit = 50,
  ) {
    const periodStart = this.getPeriodStart(period as 'daily' | 'weekly' | 'monthly');

    return prisma.leaderboardEntry.findMany({
      where: { period, periodStart: { gte: periodStart } },
      orderBy: { [sortBy]: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, nametag: true, chainPubkey: true },
        },
      },
    });
  }

  static async getReferralLeaderboard(limit = 20) {
    const referrals = await prisma.user.groupBy({
      by: ['referredById'],
      _count: { id: true },
      where: { referredById: { not: null } },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const results = [];
    for (const r of referrals) {
      if (!r.referredById) continue;
      const user = await prisma.user.findUnique({
        where: { id: r.referredById },
        select: { id: true, nametag: true, chainPubkey: true },
      });
      const rewards = await prisma.referralReward.aggregate({
        where: { referrerId: r.referredById },
        _sum: { amount: true },
      });
      results.push({
        user,
        referralCount: r._count.id,
        totalRewards: toNumber(rewards._sum.amount ?? 0),
      });
    }
    return results;
  }

  private static getPeriodStart(period: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date();
    switch (period) {
      case 'daily':
        return new Date(now.setHours(0, 0, 0, 0));
      case 'weekly': {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d;
      }
      case 'monthly': {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d;
      }
    }
  }
}