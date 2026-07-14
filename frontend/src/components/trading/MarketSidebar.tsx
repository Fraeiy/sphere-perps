import { useState } from 'react';
import { Star, Search, TrendingUp, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTradingStore } from '@/stores/trading-store';
import { cn, formatPrice, formatPercent, formatVolume } from '@/lib/utils';
import type { Market } from '@/lib/api';

interface Props {
  markets: Market[];
}

export function MarketSidebar({ markets }: Props) {
  const [search, setSearch] = useState('');
  const { selectedMarket, setSelectedMarket, favorites, toggleFavorite, recentMarkets, tickers } = useTradingStore();

  const filtered = markets.filter(
    (m) =>
      m.symbol.toLowerCase().includes(search.toLowerCase()) ||
      m.baseAsset.toLowerCase().includes(search.toLowerCase()),
  );

  const trending = markets.filter((m) => m.isTrending);
  const recent = recentMarkets.map((s) => markets.find((m) => m.symbol === s)).filter(Boolean) as Market[];

  const renderMarket = (market: Market) => {
    const ticker = tickers[market.symbol];
    const price = ticker?.price ?? market.price ?? 0;
    const change = ticker?.change24h ?? market.change24h ?? 0;
    const volume = ticker?.volume24h ?? market.volume24h ?? 0;
    const isSelected = selectedMarket?.symbol === market.symbol;
    const isFav = favorites.includes(market.symbol);

    return (
      <button
        key={market.symbol}
        onClick={() => setSelectedMarket(market)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all rounded-lg hover:bg-card-hover group',
          isSelected && 'bg-accent/10 border-l-2 border-accent',
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(market.symbol); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Star className={cn('w-3.5 h-3.5', isFav && 'fill-warning text-warning opacity-100')} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{market.baseAsset}</div>
          <div className="text-xs text-muted">{formatVolume(volume)}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm">{formatPrice(price)}</div>
          <div className={cn('text-xs font-mono', change >= 0 ? 'text-long' : 'text-short')}>
            {formatPercent(change)}
          </div>
        </div>
      </button>
    );
  };

  return (
    <aside className="w-64 border-r border-border flex flex-col shrink-0 panel-surface">
      <div className="p-3 border-b border-border/80">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            placeholder="Search markets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-4">
        {!search && recent.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 px-2 mb-1 text-xs text-muted uppercase tracking-wider">
              <Clock className="w-3 h-3" /> Recent
            </div>
            {recent.map(renderMarket)}
          </section>
        )}

        {!search && trending.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 px-2 mb-1 text-xs text-muted uppercase tracking-wider">
              <TrendingUp className="w-3 h-3" /> Trending
            </div>
            {trending.map(renderMarket)}
          </section>
        )}

        <section>
          <div className="px-2 mb-1 text-xs text-muted uppercase tracking-wider">Markets</div>
          {filtered.map(renderMarket)}
        </section>
      </div>
    </aside>
  );
}