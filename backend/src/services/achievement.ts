import { PositionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toNumber } from '../lib/decimal.js';
import { NotificationService } from './notification.js';

const ACHIEVEMENT_CHECKS: Array<{
  code: string;
  check: (userId: string) => Promise<boolean>;
}> = [
  {
    code: 'FIRST_TRADE',
    check: async (userId) => {
      const count = await prisma.trade.count({ where: { userId } });
      return count >= 1;
    },
  },
  {
    code: 'FIRST_PROFIT',
    check: async (userId) => {
      const profitable = await prisma.trade.findFirst({
        where: { userId, realizedPnl: { gt: 0 } },
      });
      return !!profitable;
    },
  },
  {
    code: 'TEN_WINS',
    check: async (userId) => {
      const wins = await prisma.trade.count({
        where: { userId, realizedPnl: { gt: 0 } },
      });
      return wins >= 10;
    },
  },
  {
    code: 'HUNDRED_TRADES',
    check: async (userId) => {
      const count = await prisma.trade.count({ where: { userId } });
      return count >= 100;
    },
  },
  {
    code: 'DIAMOND_HANDS',
    check: async (userId) => {
      const oldPosition = await prisma.position.findFirst({
        where: {
          userId,
          status: PositionStatus.OPEN,
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      return !!oldPosition;
    },
  },
  {
    code: 'HIGH_LEVERAGE',
    check: async (userId) => {
      const highLev = await prisma.position.findFirst({
        where: { userId, leverage: { gte: 50 } },
      });
      return !!highLev;
    },
  },
  {
    code: 'CONSISTENT_TRADER',
    check: async (userId) => {
      const last7Days = await prisma.trade.count({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      return last7Days >= 7;
    },
  },
];

export class AchievementService {
  static async checkTradeAchievements(userId: string) {
    for (const { code, check } of ACHIEVEMENT_CHECKS) {
      const achievement = await prisma.achievement.findUnique({ where: { code } });
      if (!achievement) continue;

      const existing = await prisma.userAchievement.findUnique({
        where: { userId_achievementId: { userId, achievementId: achievement.id } },
      });
      if (existing) continue;

      const earned = await check(userId);
      if (earned) {
        await prisma.userAchievement.create({
          data: { userId, achievementId: achievement.id },
        });

        await NotificationService.notify(userId, {
          type: 'ACHIEVEMENT_UNLOCKED',
          title: 'Achievement Unlocked',
          message: achievement.name,
          data: { code, achievementId: achievement.id },
        });
      }
    }
  }

  static async getUserAchievements(userId: string) {
    return prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
    });
  }

  static async getLeaderboardStats(userId: string, period: string) {
    const startDate = AchievementService.getPeriodStart(period);
    const trades = await prisma.trade.findMany({
      where: { userId, createdAt: { gte: startDate } },
    });

    const wins = trades.filter((t) => toNumber(t.realizedPnl) > 0).length;
    const totalPnl = trades.reduce((s, t) => s + toNumber(t.realizedPnl), 0);
    const volume = trades.reduce((s, t) => s + toNumber(t.size) * toNumber(t.price), 0);

    return {
      pnl: totalPnl,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      volume,
      tradeCount: trades.length,
    };
  }

  private static getPeriodStart(period: string): Date {
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
      default:
        return new Date(0);
    }
  }
}