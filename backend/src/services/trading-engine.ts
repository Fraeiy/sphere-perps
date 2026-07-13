import {
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  PositionStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { D, toNumber } from '../lib/decimal.js';
import { RiskEngine } from './risk-engine.js';
import { config } from '../config.js';
import { NotificationService } from './notification.js';
import { AchievementService } from './achievement.js';
import { AiService } from './ai.js';
import type { PriceFeedService } from './price-feed.js';

export interface PlaceOrderInput {
  userId: string;
  marketId: string;
  type: OrderType;
  side: OrderSide;
  size: number;
  price?: number;
  stopPrice?: number;
  leverage: number;
  marginMode?: MarginMode;
  reduceOnly?: boolean;
  stopLoss?: number;
  takeProfit?: number;
}

export class TradingEngine {
  constructor(private priceFeed: PriceFeedService) {}

  async placeOrder(input: PlaceOrderInput) {
    const system = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
    if (system && !system.tradingEnabled) {
      throw new Error('Trading is currently disabled');
    }

    const market = await prisma.market.findUnique({ where: { id: input.marketId } });
    if (!market || !market.isActive) {
      throw new Error('Market not found or inactive');
    }

    RiskEngine.validateLeverage(input.leverage, market.maxLeverage);

    if (input.size < toNumber(market.minOrderSize)) {
      throw new Error(`Minimum order size is ${toNumber(market.minOrderSize)}`);
    }

    const markPrice = this.priceFeed.getMarkPrice(market.symbol);
    if (!markPrice) {
      throw new Error('Price feed unavailable');
    }

    const balance = await prisma.balance.findUnique({ where: { userId: input.userId } });
    if (!balance) {
      throw new Error('Balance not found');
    }

    const positionSide =
      input.side === OrderSide.BUY ? PositionSide.LONG : PositionSide.SHORT;

    const executionPrice =
      input.type === OrderType.MARKET
        ? markPrice
        : input.price ?? markPrice;

    const notional = input.size * executionPrice;
    const requiredMargin = notional / input.leverage;

    const openPositions = await prisma.position.findMany({
      where: { userId: input.userId, status: PositionStatus.OPEN },
    });

    const marginMode = input.marginMode ?? MarginMode.CROSS;
    let available = toNumber(balance.available);

    if (marginMode === MarginMode.CROSS) {
      available = RiskEngine.calculateAvailableCrossMargin(
        toNumber(balance.available) + toNumber(balance.locked),
        openPositions.map((p) => ({
          marginUsed: toNumber(p.marginUsed),
          unrealizedPnl: toNumber(p.unrealizedPnl),
        })),
      );
    }

    if (!input.reduceOnly) {
      RiskEngine.validateMargin(available, requiredMargin);
    }

    const order = await prisma.order.create({
      data: {
        userId: input.userId,
        marketId: input.marketId,
        type: input.type,
        side: input.side,
        size: D(input.size),
        price: input.price ? D(input.price) : null,
        stopPrice: input.stopPrice ? D(input.stopPrice) : null,
        leverage: input.leverage,
        marginMode,
        reduceOnly: input.reduceOnly ?? false,
        status: input.type === OrderType.MARKET ? OrderStatus.PENDING : OrderStatus.OPEN,
      },
      include: { market: true },
    });

    if (input.type === OrderType.MARKET) {
      return this.fillMarketOrder(order.id, markPrice, input.stopLoss, input.takeProfit);
    }

    return order;
  }

  async fillMarketOrder(
    orderId: string,
    fillPrice: number,
    stopLoss?: number,
    takeProfit?: number,
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { market: true },
    });
    if (!order) throw new Error('Order not found');

    const size = toNumber(order.size);
    const fee = size * fillPrice * config.trading.takerFeeRate;
    const positionSide =
      order.side === OrderSide.BUY ? PositionSide.LONG : PositionSide.SHORT;

    const existingPosition = await prisma.position.findFirst({
      where: {
        userId: order.userId,
        marketId: order.marketId,
        status: PositionStatus.OPEN,
        side: positionSide,
        marginMode: order.marginMode,
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      let position;
      let realizedPnl = 0;

      if (order.reduceOnly && existingPosition) {
        const closeSize = Math.min(size, toNumber(existingPosition.size));
        realizedPnl = RiskEngine.calculateUnrealizedPnl(
          existingPosition.side,
          closeSize,
          toNumber(existingPosition.entryPrice),
          fillPrice,
        );

        const remaining = toNumber(existingPosition.size) - closeSize;
        if (remaining <= 0) {
          position = await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              status: PositionStatus.CLOSED,
              closedAt: new Date(),
              closePrice: D(fillPrice),
              closeReason: 'manual',
              realizedPnl: D(toNumber(existingPosition.realizedPnl) + realizedPnl),
              size: D(0),
            },
          });
        } else {
          position = await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              size: D(remaining),
              realizedPnl: D(toNumber(existingPosition.realizedPnl) + realizedPnl),
            },
          });
        }

        await tx.balance.update({
          where: { userId: order.userId },
          data: {
            available: { increment: D(realizedPnl - fee) },
            realizedPnl: { increment: D(realizedPnl) },
          },
        });
      } else if (existingPosition && !order.reduceOnly) {
        const oldSize = toNumber(existingPosition.size);
        const oldEntry = toNumber(existingPosition.entryPrice);
        const newSize = oldSize + size;
        const avgEntry = (oldSize * oldEntry + size * fillPrice) / newSize;

        const metrics = RiskEngine.calculateMetrics({
          side: positionSide,
          size: newSize,
          entryPrice: avgEntry,
          markPrice: fillPrice,
          leverage: order.leverage,
          marginMode: order.marginMode,
          maintenanceMarginRate: toNumber(order.market.maintenanceMargin),
        });

        position = await tx.position.update({
          where: { id: existingPosition.id },
          data: {
            size: D(newSize),
            entryPrice: D(avgEntry),
            markPrice: D(fillPrice),
            leverage: order.leverage,
            marginUsed: D(metrics.marginUsed),
            maintenanceMargin: D(metrics.maintenanceMargin),
            liquidationPrice: D(metrics.liquidationPrice),
            unrealizedPnl: D(metrics.unrealizedPnl),
            roe: D(metrics.roe),
            stopLoss: stopLoss ? D(stopLoss) : existingPosition.stopLoss,
            takeProfit: takeProfit ? D(takeProfit) : existingPosition.takeProfit,
          },
        });

        await tx.balance.update({
          where: { userId: order.userId },
          data: {
            available: { decrement: D(metrics.marginUsed - toNumber(existingPosition.marginUsed) + fee) },
            locked: { increment: D(metrics.marginUsed - toNumber(existingPosition.marginUsed)) },
          },
        });
      } else {
        const metrics = RiskEngine.calculateMetrics({
          side: positionSide,
          size,
          entryPrice: fillPrice,
          markPrice: fillPrice,
          leverage: order.leverage,
          marginMode: order.marginMode,
          maintenanceMarginRate: toNumber(order.market.maintenanceMargin),
        });

        position = await tx.position.create({
          data: {
            userId: order.userId,
            marketId: order.marketId,
            side: positionSide,
            marginMode: order.marginMode,
            leverage: order.leverage,
            size: D(size),
            entryPrice: D(fillPrice),
            markPrice: D(fillPrice),
            liquidationPrice: D(metrics.liquidationPrice),
            marginUsed: D(metrics.marginUsed),
            maintenanceMargin: D(metrics.maintenanceMargin),
            unrealizedPnl: D(0),
            roe: D(0),
            stopLoss: stopLoss ? D(stopLoss) : null,
            takeProfit: takeProfit ? D(takeProfit) : null,
          },
        });

        await tx.balance.update({
          where: { userId: order.userId },
          data: {
            available: { decrement: D(metrics.marginUsed + fee) },
            locked: { increment: D(metrics.marginUsed) },
          },
        });
      }

      const filledOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.FILLED,
          filledSize: order.size,
          avgFillPrice: D(fillPrice),
        },
        include: { market: true },
      });

      const trade = await tx.trade.create({
        data: {
          userId: order.userId,
          marketId: order.marketId,
          positionId: position?.id,
          orderId: order.id,
          side: order.side,
          size: D(size),
          price: D(fillPrice),
          fee: D(fee),
          realizedPnl: D(realizedPnl),
        },
        include: { market: true },
      });

      return { order: filledOrder, position, trade, realizedPnl };
    });

    await NotificationService.notify(order.userId, {
      type: 'ORDER_FILLED',
      title: 'Order Filled',
      message: `${order.side} ${size} ${order.market.symbol} @ $${fillPrice.toFixed(2)}`,
      data: { orderId, tradeId: result.trade.id },
    });

    await AchievementService.checkTradeAchievements(order.userId);

    if (result.realizedPnl < 0 && result.position?.status === PositionStatus.CLOSED) {
      const coachMessage = await AiService.generateTradingCoach({
        realizedPnl: result.realizedPnl,
        leverage: order.leverage,
        side: positionSide,
        symbol: order.market.symbol,
      });
      await NotificationService.notify(order.userId, {
        type: 'SYSTEM',
        title: 'Trading Coach',
        message: coachMessage,
      });
    }

    if (result.position?.status === PositionStatus.CLOSED) {
      const journal = await AiService.generateTradeJournal({
        symbol: order.market.symbol,
        side: positionSide,
        entryPrice: toNumber(result.position.entryPrice),
        exitPrice: fillPrice,
        leverage: order.leverage,
        realizedPnl: result.realizedPnl,
        size,
      });

      await prisma.tradeJournal.create({
        data: {
          userId: order.userId,
          positionId: result.position.id,
          summary: journal.summary,
          analysis: journal.analysis,
          riskScore: journal.riskScore,
          suggestions: journal.suggestions,
        },
      });
    }

    return result;
  }

  async closePosition(positionId: string, userId: string, size?: number) {
    const position = await prisma.position.findFirst({
      where: { id: positionId, userId, status: PositionStatus.OPEN },
      include: { market: true },
    });
    if (!position) throw new Error('Position not found');

    const closeSize = size ?? toNumber(position.size);
    const markPrice = this.priceFeed.getMarkPrice(position.market.symbol);
    if (!markPrice) throw new Error('Price unavailable');

    const side = position.side === PositionSide.LONG ? OrderSide.SELL : OrderSide.BUY;

    return this.placeOrder({
      userId,
      marketId: position.marketId,
      type: OrderType.MARKET,
      side,
      size: closeSize,
      leverage: position.leverage,
      marginMode: position.marginMode,
      reduceOnly: true,
    });
  }

  async cancelOrder(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId, status: { in: [OrderStatus.OPEN, OrderStatus.PENDING] } },
    });
    if (!order) throw new Error('Order not found or not cancellable');

    return prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  async processLimitOrders(symbol: string, markPrice: number) {
    const market = await prisma.market.findUnique({ where: { symbol } });
    if (!market) return;

    const openOrders = await prisma.order.findMany({
      where: {
        marketId: market.id,
        status: OrderStatus.OPEN,
        type: OrderType.LIMIT,
      },
      include: { market: true },
    });

    for (const order of openOrders) {
      const limitPrice = toNumber(order.price!);
      const shouldFill =
        (order.side === OrderSide.BUY && markPrice <= limitPrice) ||
        (order.side === OrderSide.SELL && markPrice >= limitPrice);

      if (shouldFill) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PENDING },
        });
        await this.fillMarketOrder(order.id, limitPrice);
      }
    }
  }

  async checkStopOrders(symbol: string, markPrice: number) {
    const market = await prisma.market.findUnique({ where: { symbol } });
    if (!market) return;

    const positions = await prisma.position.findMany({
      where: { marketId: market.id, status: PositionStatus.OPEN },
      include: { market: true },
    });

    for (const position of positions) {
      const sl = position.stopLoss ? toNumber(position.stopLoss) : null;
      const tp = position.takeProfit ? toNumber(position.takeProfit) : null;

      let shouldClose = false;
      let reason = '';

      if (sl) {
        if (position.side === PositionSide.LONG && markPrice <= sl) {
          shouldClose = true;
          reason = 'stop_loss';
        } else if (position.side === PositionSide.SHORT && markPrice >= sl) {
          shouldClose = true;
          reason = 'stop_loss';
        }
      }

      if (tp) {
        if (position.side === PositionSide.LONG && markPrice >= tp) {
          shouldClose = true;
          reason = 'take_profit';
        } else if (position.side === PositionSide.SHORT && markPrice <= tp) {
          shouldClose = true;
          reason = 'take_profit';
        }
      }

      if (shouldClose) {
        await this.closePosition(position.id, position.userId);
        await NotificationService.notify(position.userId, {
          type: reason === 'stop_loss' ? 'SL_HIT' : 'TP_HIT',
          title: reason === 'stop_loss' ? 'Stop Loss Hit' : 'Take Profit Hit',
          message: `Position ${position.market.symbol} closed at $${markPrice.toFixed(2)}`,
        });
      }
    }
  }
}