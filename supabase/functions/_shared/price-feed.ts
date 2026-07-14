import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { num } from './decimal.ts';

const BINANCE_REST = 'https://fapi.binance.com';

export interface TickerData {
  symbol: string;
  price: number;
  markPrice: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  fundingRate: number;
  nextFundingAt: string | null;
}

export function getNextFundingTime(intervalHours = 8): string {
  const now = new Date();
  const hours = now.getUTCHours();
  const nextHour = Math.ceil(hours / intervalHours) * intervalHours;
  const next = new Date(now);
  next.setUTCHours(nextHour % 24, 0, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + intervalHours);
  return next.toISOString();
}

export async function getMarkPrice(supabase: SupabaseClient, symbol: string): Promise<number | null> {
  const { data } = await supabase.from('market_prices').select('mark_price, price').eq('symbol', symbol).maybeSingle();
  if (!data) return null;
  const mark = num(data.mark_price);
  const price = num(data.price);
  return mark || price || null;
}

export async function getTicker(supabase: SupabaseClient, symbol: string): Promise<TickerData | null> {
  const { data } = await supabase.from('market_prices').select('*').eq('symbol', symbol).maybeSingle();
  if (!data) return null;
  return {
    symbol: data.symbol,
    price: num(data.price),
    markPrice: num(data.mark_price) || num(data.price),
    change24h: num(data.change_24h),
    volume24h: num(data.volume_24h),
    high24h: num(data.high_24h),
    low24h: num(data.low_24h),
    fundingRate: num(data.funding_rate),
    nextFundingAt: data.next_funding_at,
  };
}

export async function fetchBinanceTickers(binanceSymbols: string[]): Promise<Map<string, Partial<TickerData>>> {
  const out = new Map<string, Partial<TickerData>>();
  if (!binanceSymbols.length) return out;

  try {
    const [tickerRes, markRes] = await Promise.all([
      fetch(`${BINANCE_REST}/fapi/v1/ticker/24hr`),
      fetch(`${BINANCE_REST}/fapi/v1/premiumIndex`),
    ]);
    const tickers = await tickerRes.json() as Array<Record<string, string>>;
    const marks = await markRes.json() as Array<Record<string, string>>;

    const markMap = new Map(marks.map((m) => [m.symbol, m]));

    for (const sym of binanceSymbols) {
      const t = tickers.find((x) => x.symbol === sym);
      const m = markMap.get(sym);
      if (!t) continue;
      out.set(sym, {
        price: parseFloat(t.lastPrice),
        markPrice: m ? parseFloat(m.markPrice) : parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        volume24h: parseFloat(t.quoteVolume),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
        fundingRate: m ? parseFloat(m.lastFundingRate) : 0,
        nextFundingAt: m?.nextFundingTime ? new Date(parseInt(m.nextFundingTime)).toISOString() : getNextFundingTime(),
      });
    }
  } catch (e) {
    console.error('[price-feed] Binance fetch failed:', e);
  }
  return out;
}

export async function fetchCandles(
  supabase: SupabaseClient,
  symbol: string,
  interval: string,
  limit = 500,
) {
  const { data: market } = await supabase.from('markets').select('binance_symbol').eq('symbol', symbol).maybeSingle();
  if (!market) return [];

  try {
    const res = await fetch(
      `${BINANCE_REST}/fapi/v1/klines?symbol=${market.binance_symbol}&interval=${interval}&limit=${limit}`,
    );
    const data = await res.json() as Array<[number, string, string, string, string, string]>;
    return data.map((k) => ({
      symbol,
      interval,
      time: k[0] / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    console.error('[price-feed] candles failed:', e);
    return [];
  }
}

export async function upsertMarketPrices(
  supabase: SupabaseClient,
  markets: Array<{ id: string; symbol: string; binance_symbol: string; funding_rate: unknown }>,
) {
  const binanceData = await fetchBinanceTickers(markets.map((m) => m.binance_symbol));
  let count = 0;

  for (const market of markets) {
    const tick = binanceData.get(market.binance_symbol);
    if (!tick) continue;

    await supabase.from('market_prices').upsert({
      market_id: market.id,
      symbol: market.symbol,
      price: tick.price ?? 0,
      mark_price: tick.markPrice ?? tick.price ?? 0,
      change_24h: tick.change24h ?? 0,
      volume_24h: tick.volume24h ?? 0,
      high_24h: tick.high24h ?? 0,
      low_24h: tick.low24h ?? 0,
      funding_rate: tick.fundingRate ?? num(market.funding_rate),
      next_funding_at: tick.nextFundingAt ?? getNextFundingTime(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'market_id' });
    count++;
  }
  return count;
}