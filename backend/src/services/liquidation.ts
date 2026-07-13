import { PositionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toNumber, D } from '../lib/decimal.js';
import { RiskEngine } from './risk-engine.js';
import { NotificationService } from './notification.js';
import type { PriceFeedService } from './price-feed.js';

export class LiquidationService {
  constructor(private priceFeed: PriceFeedService) {}

  async updatePositions(symbol: string, markPrice: number) {
    const market = await prisma.market.findUnique({ where: { symbol } });
    if (!market) return;

    const positions = await prisma.position.findMany({
      where: { marketId: market.id, status: PositionStatus.OPEN },
      include: { market: true, user: true },
    });

    for (const position of positions) {
      const metrics = RiskEngine.calculateMetrics({
        side: position.side,
        size: toNumber(position.size),
        entryPrice: toNumber(position.entryPrice),
        markPrice,
        leverage: position.leverage,
        marginMode: position.marginMode,
        maintenanceMarginRate: toNumber(market.maintenanceMargin),
      });

      await prisma.position.update({
        where: { id: position.id },
        data: {
          markPrice: D(markPrice),
          unrealizedPnl: D(metrics.unrealizedPnl),
          roe: D(metrics.roe),
          liquidationPrice: D(metrics.liquidationPrice),
          maintenanceMargin: D(metrics.maintenanceMargin),
        },
      });

      const liqDistance =
        position.side === 'LONG'
          ? (markPrice - metrics.liquidationPrice) / markPrice
          : (metrics.liquidationPrice - markPrice) / markPrice;

      if (liqDistance < 0.05 && liqDistance > 0) {
        await NotificationService.notify(position.userId, {
          type: 'LIQUIDATION_WARNING',
          title: 'Liquidation Warning',
          message: `${symbol} position within ${(liqDistance * 100).toFixed(1)}% of liquidation price`,
          data: { positionId: position.id, liquidationPrice: metrics.liquidationPrice },
        });
      }

      if (RiskEngine.shouldLiquidate(position.side, markPrice, metrics.liquidationPrice)) {
        await this.liquidatePosition(position.id, markPrice);
      }
    }
  }

  async liquidatePosition(positionId: string, markPrice: number) {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { market: true },
    });
    if (!position || position.status !== PositionStatus.OPEN) return;

    const realizedPnl = RiskEngine.calculateUnrealizedPnl(
      position.side,
      toNumber(position.size),
      toNumber(position.entryPrice),
      markPrice,
    );

    await prisma.$transaction(async (tx) => {
      await tx.position.update({
        where: { id: positionId },
        data: {
          status: PositionStatus.LIQUIDATED,
          closedAt: new Date(),
          closePrice: D(markPrice),
          closeReason: 'liquidation',
          realizedPnl: D(toNumber(position.realizedPnl) + realizedPnl),
          unrealizedPnl: D(0),
          size: D(0),
        },
      });

      const marginReturn = Math.max(0, toNumber(position.marginUsed) + realizedPnl);

      await tx.balance.update({
        where: { userId: position.userId },
        data: {
          locked: { decrement: D(toNumber(position.marginUsed)) },
          available: { increment: D(marginReturn) },
          realizedPnl: { increment: D(realizedPnl) },
        },
      });

      await tx.trade.create({
        data: {
          userId: position.userId,
          marketId: position.marketId,
          positionId,
          side: position.side === 'LONG' ? 'SELL' : 'BUY',
          size: position.size,
          price: D(markPrice),
          realizedPnl: D(realizedPnl),
          fee: D(0),
        },
      });
    });

    await NotificationService.notify(position.userId, {
      type: 'LIQUIDATION_WARNING',
      title: 'Position Liquidated',
      message: `Your ${position.market.symbol} position was liquidated at $${markPrice.toFixed(2)}`,
      data: { positionId },
    });
  }
}