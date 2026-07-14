import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { upsertMarketPrices } from '../_shared/price-feed.ts';
import { LiquidationService } from '../_shared/liquidation.ts';
import { TradingEngine } from '../_shared/trading-engine.ts';
import { num } from '../_shared/decimal.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return errorResponse('Unauthorized cron invocation', 401);
  }

  try {
    const supabase = createServiceClient();
    const { data: markets } = await supabase
      .from('markets')
      .select('id, symbol, binance_symbol, funding_rate')
      .eq('is_active', true);

    if (!markets?.length) return jsonResponse({ ok: true, marketsProcessed: 0 });

    const updated = await upsertMarketPrices(supabase, markets);
    const liquidation = new LiquidationService(supabase);
    const trading = new TradingEngine(supabase);

    for (const market of markets) {
      const { data: priceRow } = await supabase
        .from('market_prices')
        .select('mark_price, price')
        .eq('symbol', market.symbol)
        .maybeSingle();
      const markPrice = num(priceRow?.mark_price) || num(priceRow?.price);
      if (!markPrice) continue;

      await liquidation.updatePositions(market.symbol, markPrice);
      await trading.processLimitOrders(market.symbol, markPrice);
      await trading.checkStopOrders(market.symbol, markPrice);
    }

    await supabase.from('engine_status').upsert({
      id: 'global',
      last_run_at: new Date().toISOString(),
      markets_processed: updated,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({ ok: true, marketsProcessed: updated, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[process-markets]', err);
    return errorResponse(err instanceof Error ? err.message : 'Engine failed', 500);
  }
});