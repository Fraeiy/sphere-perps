import { PositionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toNumber, D } from '../lib/decimal.js';
import { RiskEngine } from './risk-engine.js';
import type { PriceFeedService } from './price-feed.js';

export class FundingService {
  constructor(private priceFeed: PriceFeedService) {}

  async processFunding(symbol: string) {
    const market = await prisma.market.findUnique({ where: { symbol } });
    if (!market) return;

    const markPrice = this.priceFeed.getMarkPrice(symbol);
    if (!markPrice) return;

    const fundingRate = toNumber(market.fundingRate);
    const positions = await prisma.position.findMany({
      where: { marketId: market.id, status: PositionStatus.OPEN },
    });

    for (const position of positions) {
      const payment = RiskEngine.calculateFundingPayment(
        toNumber(position.size),
        markPrice,
        fundingRate,
        position.side,
      );

      await prisma.$transaction(async (tx) => {
        await tx.fundingPayment.create({
          data: {
            userId: position.userId,
            marketId: market.id,
            positionId: position.id,
            rate: D(fundingRate),
            payment: D(payment),
            markPrice: D(markPrice),
            size: position.size,
          },
        });

        await tx.balance.update({
          where: { userId: position.userId },
          data: {
            available: { increment: D(payment) },
          },
        });
      });
    }
  }
}