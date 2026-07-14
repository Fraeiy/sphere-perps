import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { Ticker } from '@/lib/api';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function rowToTicker(row: Record<string, unknown>): Ticker {
  return {
    symbol: String(row.symbol),
    price: Number(row.price ?? 0),
    markPrice: Number(row.mark_price ?? row.price ?? 0),
    change24h: Number(row.change_24h ?? 0),
    volume24h: Number(row.volume_24h ?? 0),
    fundingRate: Number(row.funding_rate ?? 0),
    nextFundingAt: String(row.next_funding_at ?? ''),
  };
}

class RealtimeClient {
  private client = url && anonKey ? createClient(url, anonKey) : null;
  private channel: RealtimeChannel | null = null;

  subscribeMarketPrices(onTicker: (ticker: Ticker) => void) {
    if (!this.client) return () => undefined;

    this.channel = this.client
      .channel('sphere-perps-prices')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_prices' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            onTicker(rowToTicker(payload.new as Record<string, unknown>));
          }
        },
      )
      .subscribe();

    return () => {
      if (this.channel && this.client) {
        this.client.removeChannel(this.channel);
        this.channel = null;
      }
    };
  }

  disconnect() {
    if (this.channel && this.client) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

export const realtimeClient = new RealtimeClient();