import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { num, round8 } from './decimal.ts';
import { RiskEngine, type PositionSide } from './risk-engine.ts';
import { notify } from './notify.ts';

export class LiquidationService {
  constructor(private supabase: SupabaseClient) {}

  async updatePositions(symbol: string, markPrice: number) {
    const { data: market } = await this.supabase.from('markets').select('*').eq('symbol', symbol).maybeSingle();
    if (!market) return;

    const { data: positions } = await this.supabase
      .from('positions')
      .select('*, user:users(*)')
      .eq('market_id', market.id)
      .eq('status', 'OPEN');

    for (const position of positions ?? []) {
      const metrics = RiskEngine.calculateMetrics({
        side: position.side as PositionSide,
        size: num(position.size),
        entryPrice: num(position.entry_price),
        markPrice,
        leverage: position.leverage,
        marginMode: position.margin_mode,
        maintenanceMarginRate: num(market.maintenance_margin),
      });

      await this.supabase.from('positions').update({
        mark_price: markPrice,
        unrealized_pnl: metrics.unrealizedPnl,
        roe: metrics.roe,
        liquidation_price: metrics.liquidationPrice,
        maintenance_margin: metrics.maintenanceMargin,
      }).eq('id', position.id);

      const liqDistance = position.side === 'LONG'
        ? (markPrice - metrics.liquidationPrice) / markPrice
        : (metrics.liquidationPrice - markPrice) / markPrice;

      if (liqDistance < 0.05 && liqDistance > 0) {
        await notify(this.supabase, position.user_id, {
          type: 'LIQUIDATION_WARNING',
          title: 'Liquidation Warning',
          message: `${symbol} position within ${(liqDistance * 100).toFixed(1)}% of liquidation price`,
          data: { positionId: position.id, liquidationPrice: metrics.liquidationPrice },
        });
      }

      if (RiskEngine.shouldLiquidate(position.side as PositionSide, markPrice, metrics.liquidationPrice)) {
        await this.liquidatePosition(position.id, markPrice);
      }
    }
  }

  async liquidatePosition(positionId: string, markPrice: number) {
    const { data: position } = await this.supabase
      .from('positions')
      .select('*, market:markets(*)')
      .eq('id', positionId)
      .maybeSingle();
    if (!position || position.status !== 'OPEN') return;

    const realizedPnl = RiskEngine.calculateUnrealizedPnl(
      position.side as PositionSide,
      num(position.size),
      num(position.entry_price),
      markPrice,
    );

    await this.supabase.from('positions').update({
      status: 'LIQUIDATED',
      closed_at: new Date().toISOString(),
      close_price: markPrice,
      close_reason: 'liquidation',
      realized_pnl: round8(num(position.realized_pnl) + realizedPnl),
      unrealized_pnl: 0,
      size: 0,
    }).eq('id', positionId);

    const marginReturn = Math.max(0, num(position.margin_used) + realizedPnl);
    const { data: bal } = await this.supabase.from('balances').select('*').eq('user_id', position.user_id).single();
    if (bal) {
      await this.supabase.from('balances').update({
        locked: round8(num(bal.locked) - num(position.margin_used)),
        available: round8(num(bal.available) + marginReturn),
        realized_pnl: round8(num(bal.realized_pnl) + realizedPnl),
      }).eq('user_id', position.user_id);
    }

    await this.supabase.from('trades').insert({
      user_id: position.user_id,
      market_id: position.market_id,
      position_id: positionId,
      side: position.side === 'LONG' ? 'SELL' : 'BUY',
      size: position.size,
      price: markPrice,
      realized_pnl: realizedPnl,
      fee: 0,
    });

    await notify(this.supabase, position.user_id, {
      type: 'LIQUIDATION_WARNING',
      title: 'Position Liquidated',
      message: `Your ${position.market.symbol} position was liquidated at $${markPrice.toFixed(2)}`,
      data: { positionId },
    });
  }
}