import { MarginMode, PositionSide } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { D, toNumber } from '../lib/decimal.js';

export interface RiskParams {
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  marginMode: MarginMode;
  maintenanceMarginRate: number;
  walletBalance?: number;
  isolatedMargin?: number;
}

export interface RiskMetrics {
  notionalValue: number;
  marginUsed: number;
  maintenanceMargin: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  roe: number;
}

export class RiskEngine {
  static calculateNotional(size: number, price: number): number {
    return Math.abs(size) * price;
  }

  static calculateMarginUsed(notional: number, leverage: number): number {
    return notional / leverage;
  }

  static calculateMaintenanceMargin(notional: number, rate: number): number {
    return notional * rate;
  }

  static calculateUnrealizedPnl(
    side: PositionSide,
    size: number,
    entryPrice: number,
    markPrice: number,
  ): number {
    const diff = markPrice - entryPrice;
    return side === PositionSide.LONG ? diff * size : -diff * size;
  }

  static calculateRoe(unrealizedPnl: number, marginUsed: number): number {
    if (marginUsed <= 0) return 0;
    return (unrealizedPnl / marginUsed) * 100;
  }

  static calculateLiquidationPrice(params: {
    side: PositionSide;
    entryPrice: number;
    leverage: number;
    maintenanceMarginRate: number;
  }): number {
    const { side, entryPrice, leverage, maintenanceMarginRate } = params;
    const mmr = maintenanceMarginRate;
    const imr = 1 / leverage;

    if (side === PositionSide.LONG) {
      return entryPrice * (1 - imr + mmr);
    }
    return entryPrice * (1 + imr - mmr);
  }

  static calculateMetrics(params: RiskParams): RiskMetrics {
    const notional = this.calculateNotional(params.size, params.markPrice);
    const marginUsed =
      params.marginMode === MarginMode.ISOLATED && params.isolatedMargin
        ? params.isolatedMargin
        : this.calculateMarginUsed(notional, params.leverage);
    const maintenanceMargin = this.calculateMaintenanceMargin(
      notional,
      params.maintenanceMarginRate,
    );
    const unrealizedPnl = this.calculateUnrealizedPnl(
      params.side,
      params.size,
      params.entryPrice,
      params.markPrice,
    );
    const liquidationPrice = this.calculateLiquidationPrice({
      side: params.side,
      entryPrice: params.entryPrice,
      leverage: params.leverage,
      maintenanceMarginRate: params.maintenanceMarginRate,
    });

    return {
      notionalValue: notional,
      marginUsed,
      maintenanceMargin,
      liquidationPrice,
      unrealizedPnl,
      realizedPnl: 0,
      roe: this.calculateRoe(unrealizedPnl, marginUsed),
    };
  }

  static shouldLiquidate(
    side: PositionSide,
    markPrice: number,
    liquidationPrice: number,
  ): boolean {
    if (side === PositionSide.LONG) {
      return markPrice <= liquidationPrice;
    }
    return markPrice >= liquidationPrice;
  }

  static calculateFundingPayment(
    size: number,
    markPrice: number,
    fundingRate: number,
    side: PositionSide,
  ): number {
    const notional = size * markPrice;
    const payment = notional * fundingRate;
    return side === PositionSide.LONG ? -payment : payment;
  }

  static estimateLiquidationForOrder(params: {
    side: PositionSide;
    entryPrice: number;
    leverage: number;
    maintenanceMarginRate: number;
  }): number {
    return this.calculateLiquidationPrice(params);
  }

  static toDecimalMetrics(metrics: RiskMetrics): Record<string, Decimal> {
    return {
      marginUsed: D(metrics.marginUsed),
      maintenanceMargin: D(metrics.maintenanceMargin),
      liquidationPrice: D(metrics.liquidationPrice),
      unrealizedPnl: D(metrics.unrealizedPnl),
      realizedPnl: D(metrics.realizedPnl),
      roe: D(metrics.roe),
      markPrice: D(0),
    };
  }

  static validateLeverage(leverage: number, maxLeverage: number): void {
    const allowed = [1, 2, 5, 10, 20, 50, 100];
    if (!allowed.includes(leverage)) {
      throw new Error(`Invalid leverage. Allowed: ${allowed.join(', ')}`);
    }
    if (leverage > maxLeverage) {
      throw new Error(`Leverage exceeds market maximum of ${maxLeverage}x`);
    }
  }

  static validateMargin(
    availableBalance: number,
    requiredMargin: number,
  ): void {
    if (availableBalance < requiredMargin) {
      throw new Error(
        `Insufficient margin. Required: ${requiredMargin.toFixed(2)}, Available: ${availableBalance.toFixed(2)}`,
      );
    }
  }

  static calculateAvailableCrossMargin(
    balance: number,
    openPositions: Array<{ marginUsed: number; unrealizedPnl: number }>,
  ): number {
    const usedMargin = openPositions.reduce((sum, p) => sum + p.marginUsed, 0);
    const totalUnrealized = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    return balance + totalUnrealized - usedMargin;
  }

  static formatRiskSummary(metrics: RiskMetrics): string {
    return [
      `Notional: $${metrics.notionalValue.toFixed(2)}`,
      `Margin: $${metrics.marginUsed.toFixed(2)}`,
      `Liq: $${metrics.liquidationPrice.toFixed(2)}`,
      `PnL: $${metrics.unrealizedPnl.toFixed(2)} (${metrics.roe.toFixed(2)}% ROE)`,
    ].join(' | ');
  }
}

export type TradeRiskAssessment = {
  risk: 'low' | 'medium' | 'high' | 'extreme';
  reward: number;
  trendDirection: 'bullish' | 'bearish' | 'neutral';
  volatility: 'low' | 'medium' | 'high';
  suggestedLeverage: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  score: number;
  explanation: string;
};

export class TradeRiskScorer {
  static assess(params: {
    side: PositionSide;
    leverage: number;
    size: number;
    entryPrice: number;
    change24h: number;
    accountBalance: number;
    marginUsed: number;
  }): TradeRiskAssessment {
    const { side, leverage, size, entryPrice, change24h, accountBalance, marginUsed } = params;
    const notional = size * entryPrice;
    const accountRiskPct = accountBalance > 0 ? (marginUsed / accountBalance) * 100 : 100;
    const volatility = Math.abs(change24h) > 5 ? 'high' : Math.abs(change24h) > 2 ? 'medium' : 'low';

    let risk: TradeRiskAssessment['risk'] = 'low';
    let score = 20;

    if (leverage >= 50 || accountRiskPct > 25) {
      risk = 'extreme';
      score = 90;
    } else if (leverage >= 20 || accountRiskPct > 15) {
      risk = 'high';
      score = 70;
    } else if (leverage >= 10 || accountRiskPct > 8) {
      risk = 'medium';
      score = 45;
    }

    const trendDirection: TradeRiskAssessment['trendDirection'] =
      change24h > 1 ? 'bullish' : change24h < -1 ? 'bearish' : 'neutral';

    const slPct = volatility === 'high' ? 0.02 : volatility === 'medium' ? 0.015 : 0.01;
    const tpPct = slPct * 2;

    const suggestedStopLoss =
      side === PositionSide.LONG
        ? entryPrice * (1 - slPct)
        : entryPrice * (1 + slPct);

    const suggestedTakeProfit =
      side === PositionSide.LONG
        ? entryPrice * (1 + tpPct)
        : entryPrice * (1 - tpPct);

    const suggestedLeverage = Math.min(
      leverage,
      volatility === 'high' ? 5 : volatility === 'medium' ? 10 : 20,
    );

    return {
      risk,
      reward: tpPct * 100,
      trendDirection,
      volatility,
      suggestedLeverage,
      suggestedStopLoss,
      suggestedTakeProfit,
      score,
      explanation: `${risk.toUpperCase()} risk trade with ${leverage}x leverage risking ${accountRiskPct.toFixed(1)}% of account on $${notional.toFixed(0)} notional.`,
    };
  }
}