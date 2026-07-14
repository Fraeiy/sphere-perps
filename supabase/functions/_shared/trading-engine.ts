import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { num, round8 } from './decimal.ts';
import { RiskEngine, type MarginMode, type PositionSide } from './risk-engine.ts';
import { getMarkPrice } from './price-feed.ts';
import { notify } from './notify.ts';

const TAKER_FEE_RATE = 0.0006;

export interface PlaceOrderInput {
  userId: string;
  marketId: string;
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  side: 'BUY' | 'SELL';
  size: number;
  price?: number;
  leverage: number;
  marginMode?: MarginMode;
  reduceOnly?: boolean;
  stopLoss?: number;
  takeProfit?: number;
}

export class TradingEngine {
  constructor(private supabase: SupabaseClient) {}

  async placeOrder(input: PlaceOrderInput) {
    const { data: system } = await this.supabase.from('system_settings').select('*').eq('id', 'global').maybeSingle();
    if (system && !system.trading_enabled) throw new Error('Trading is currently disabled');

    const { data: market } = await this.supabase.from('markets').select('*').eq('id', input.marketId).maybeSingle();
    if (!market || !market.is_active) throw new Error('Market not found or inactive');

    RiskEngine.validateLeverage(input.leverage, market.max_leverage);
    if (input.size < num(market.min_order_size)) {
      throw new Error(`Minimum order size is ${num(market.min_order_size)}`);
    }

    const markPrice = await getMarkPrice(this.supabase, market.symbol);
    if (!markPrice) throw new Error('Price feed unavailable — wait for market engine');

    const { data: balance } = await this.supabase.from('balances').select('*').eq('user_id', input.userId).maybeSingle();
    if (!balance) throw new Error('Balance not found');

    const positionSide: PositionSide = input.side === 'BUY' ? 'LONG' : 'SHORT';
    const executionPrice = input.type === 'MARKET' ? markPrice : (input.price ?? markPrice);
    const requiredMargin = (input.size * executionPrice) / input.leverage;
    const marginMode = input.marginMode ?? 'CROSS';

    const { data: openPositions } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', input.userId)
      .eq('status', 'OPEN');

    let available = num(balance.available);
    if (marginMode === 'CROSS') {
      available = RiskEngine.calculateAvailableCrossMargin(
        num(balance.available) + num(balance.locked),
        (openPositions ?? []).map((p) => ({
          marginUsed: num(p.margin_used),
          unrealizedPnl: num(p.unrealized_pnl),
        })),
      );
    }

    if (!input.reduceOnly) RiskEngine.validateMargin(available, requiredMargin);

    const orderStatus = input.type === 'MARKET' ? 'PENDING' : 'OPEN';
    const { data: order, error } = await this.supabase
      .from('orders')
      .insert({
        user_id: input.userId,
        market_id: input.marketId,
        type: input.type,
        side: input.side,
        size: input.size,
        price: input.price ?? null,
        leverage: input.leverage,
        margin_mode: marginMode,
        reduce_only: input.reduceOnly ?? false,
        status: orderStatus,
      })
      .select('*, market:markets(*)')
      .single();
    if (error || !order) throw error ?? new Error('Failed to create order');

    if (input.type === 'MARKET') {
      return this.fillMarketOrder(order.id, markPrice, input.stopLoss, input.takeProfit);
    }
    return order;
  }

  async fillMarketOrder(orderId: string, fillPrice: number, stopLoss?: number, takeProfit?: number) {
    const { data: order } = await this.supabase
      .from('orders')
      .select('*, market:markets(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) throw new Error('Order not found');

    const size = num(order.size);
    const fee = round8(size * fillPrice * TAKER_FEE_RATE);
    const positionSide: PositionSide = order.side === 'BUY' ? 'LONG' : 'SHORT';

    const { data: existingPosition } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', order.user_id)
      .eq('market_id', order.market_id)
      .eq('status', 'OPEN')
      .eq('side', positionSide)
      .eq('margin_mode', order.margin_mode)
      .maybeSingle();

    let position: Record<string, unknown> | null = null;
    let realizedPnl = 0;

    if (order.reduce_only && existingPosition) {
      const closeSize = Math.min(size, num(existingPosition.size));
      realizedPnl = RiskEngine.calculateUnrealizedPnl(
        existingPosition.side as PositionSide,
        closeSize,
        num(existingPosition.entry_price),
        fillPrice,
      );
      const remaining = num(existingPosition.size) - closeSize;

      if (remaining <= 0) {
        const { data: closed } = await this.supabase.from('positions').update({
          status: 'CLOSED',
          closed_at: new Date().toISOString(),
          close_price: fillPrice,
          close_reason: 'manual',
          realized_pnl: round8(num(existingPosition.realized_pnl) + realizedPnl),
          size: 0,
        }).eq('id', existingPosition.id).select('*').single();
        position = closed;
      } else {
        const { data: updated } = await this.supabase.from('positions').update({
          size: remaining,
          realized_pnl: round8(num(existingPosition.realized_pnl) + realizedPnl),
        }).eq('id', existingPosition.id).select('*').single();
        position = updated;
      }

      const { data: bal } = await this.supabase.from('balances').select('*').eq('user_id', order.user_id).single();
      if (bal) {
        await this.supabase.from('balances').update({
          available: round8(num(bal.available) + realizedPnl - fee),
          realized_pnl: round8(num(bal.realized_pnl) + realizedPnl),
        }).eq('user_id', order.user_id);
      }
    } else if (existingPosition && !order.reduce_only) {
      const oldSize = num(existingPosition.size);
      const oldEntry = num(existingPosition.entry_price);
      const newSize = oldSize + size;
      const avgEntry = (oldSize * oldEntry + size * fillPrice) / newSize;
      const metrics = RiskEngine.calculateMetrics({
        side: positionSide,
        size: newSize,
        entryPrice: avgEntry,
        markPrice: fillPrice,
        leverage: order.leverage,
        marginMode: order.margin_mode as MarginMode,
        maintenanceMarginRate: num(order.market.maintenance_margin),
      });

      const { data: updated } = await this.supabase.from('positions').update({
        size: newSize,
        entry_price: avgEntry,
        mark_price: fillPrice,
        leverage: order.leverage,
        margin_used: metrics.marginUsed,
        maintenance_margin: metrics.maintenanceMargin,
        liquidation_price: metrics.liquidationPrice,
        unrealized_pnl: metrics.unrealizedPnl,
        roe: metrics.roe,
        stop_loss: stopLoss ?? existingPosition.stop_loss,
        take_profit: takeProfit ?? existingPosition.take_profit,
      }).eq('id', existingPosition.id).select('*').single();
      position = updated;

      const marginDelta = metrics.marginUsed - num(existingPosition.margin_used);
      const { data: bal } = await this.supabase.from('balances').select('*').eq('user_id', order.user_id).single();
      if (bal) {
        await this.supabase.from('balances').update({
          available: round8(num(bal.available) - marginDelta - fee),
          locked: round8(num(bal.locked) + marginDelta),
        }).eq('user_id', order.user_id);
      }
    } else if (!order.reduce_only) {
      const metrics = RiskEngine.calculateMetrics({
        side: positionSide,
        size,
        entryPrice: fillPrice,
        markPrice: fillPrice,
        leverage: order.leverage,
        marginMode: order.margin_mode as MarginMode,
        maintenanceMarginRate: num(order.market.maintenance_margin),
      });

      const { data: created } = await this.supabase.from('positions').insert({
        user_id: order.user_id,
        market_id: order.market_id,
        side: positionSide,
        margin_mode: order.margin_mode,
        leverage: order.leverage,
        size,
        entry_price: fillPrice,
        mark_price: fillPrice,
        liquidation_price: metrics.liquidationPrice,
        margin_used: metrics.marginUsed,
        maintenance_margin: metrics.maintenanceMargin,
        unrealized_pnl: 0,
        roe: 0,
        stop_loss: stopLoss ?? null,
        take_profit: takeProfit ?? null,
      }).select('*').single();
      position = created;

      const { data: bal } = await this.supabase.from('balances').select('*').eq('user_id', order.user_id).single();
      if (bal) {
        await this.supabase.from('balances').update({
          available: round8(num(bal.available) - metrics.marginUsed - fee),
          locked: round8(num(bal.locked) + metrics.marginUsed),
        }).eq('user_id', order.user_id);
      }
    }

    const { data: filledOrder } = await this.supabase.from('orders').update({
      status: 'FILLED',
      filled_size: order.size,
      avg_fill_price: fillPrice,
    }).eq('id', orderId).select('*, market:markets(*)').single();

    const { data: trade } = await this.supabase.from('trades').insert({
      user_id: order.user_id,
      market_id: order.market_id,
      position_id: position?.id ?? null,
      order_id: order.id,
      side: order.side,
      size,
      price: fillPrice,
      fee,
      realized_pnl: realizedPnl,
    }).select('*, market:markets(*)').single();

    await notify(this.supabase, order.user_id, {
      type: 'ORDER_FILLED',
      title: 'Order Filled',
      message: `${order.side} ${size} ${order.market.symbol} @ $${fillPrice.toFixed(2)}`,
      data: { orderId, tradeId: trade?.id },
    });

    return { order: filledOrder, position, trade, realizedPnl };
  }

  async closePosition(positionId: string, userId: string, size?: number) {
    const { data: position } = await this.supabase
      .from('positions')
      .select('*, market:markets(*)')
      .eq('id', positionId)
      .eq('user_id', userId)
      .eq('status', 'OPEN')
      .maybeSingle();
    if (!position) throw new Error('Position not found');

    const closeSize = size ?? num(position.size);
    const side = position.side === 'LONG' ? 'SELL' : 'BUY';

    return this.placeOrder({
      userId,
      marketId: position.market_id,
      type: 'MARKET',
      side: side as 'BUY' | 'SELL',
      size: closeSize,
      leverage: position.leverage,
      marginMode: position.margin_mode as MarginMode,
      reduceOnly: true,
    });
  }

  async cancelOrder(orderId: string, userId: string) {
    const { data: order } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .in('status', ['OPEN', 'PENDING'])
      .maybeSingle();
    if (!order) throw new Error('Order not found or not cancellable');

    const { data: updated } = await this.supabase
      .from('orders')
      .update({ status: 'CANCELLED' })
      .eq('id', orderId)
      .select('*')
      .single();
    return updated;
  }

  async processLimitOrders(symbol: string, markPrice: number) {
    const { data: market } = await this.supabase.from('markets').select('id').eq('symbol', symbol).maybeSingle();
    if (!market) return;

    const { data: openOrders } = await this.supabase
      .from('orders')
      .select('*, market:markets(*)')
      .eq('market_id', market.id)
      .eq('status', 'OPEN')
      .eq('type', 'LIMIT');

    for (const order of openOrders ?? []) {
      const limitPrice = num(order.price);
      const shouldFill =
        (order.side === 'BUY' && markPrice <= limitPrice) ||
        (order.side === 'SELL' && markPrice >= limitPrice);
      if (shouldFill) {
        await this.supabase.from('orders').update({ status: 'PENDING' }).eq('id', order.id);
        await this.fillMarketOrder(order.id, limitPrice);
      }
    }
  }

  async checkStopOrders(symbol: string, markPrice: number) {
    const { data: market } = await this.supabase.from('markets').select('id, symbol').eq('symbol', symbol).maybeSingle();
    if (!market) return;

    const { data: positions } = await this.supabase
      .from('positions')
      .select('*, market:markets(*)')
      .eq('market_id', market.id)
      .eq('status', 'OPEN');

    for (const position of positions ?? []) {
      const sl = position.stop_loss ? num(position.stop_loss) : null;
      const tp = position.take_profit ? num(position.take_profit) : null;
      let shouldClose = false;
      let reason = '';

      if (sl) {
        if (position.side === 'LONG' && markPrice <= sl) { shouldClose = true; reason = 'stop_loss'; }
        else if (position.side === 'SHORT' && markPrice >= sl) { shouldClose = true; reason = 'stop_loss'; }
      }
      if (tp) {
        if (position.side === 'LONG' && markPrice >= tp) { shouldClose = true; reason = 'take_profit'; }
        else if (position.side === 'SHORT' && markPrice <= tp) { shouldClose = true; reason = 'take_profit'; }
      }

      if (shouldClose) {
        await this.closePosition(position.id, position.user_id);
        await notify(this.supabase, position.user_id, {
          type: reason === 'stop_loss' ? 'SL_HIT' : 'TP_HIT',
          title: reason === 'stop_loss' ? 'Stop Loss Hit' : 'Take Profit Hit',
          message: `Position ${market.symbol} closed at $${markPrice.toFixed(2)}`,
        });
      }
    }
  }
}