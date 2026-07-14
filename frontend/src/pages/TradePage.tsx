import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { realtimeClient } from '@/lib/realtime';
import { useTradingStore } from '@/stores/trading-store';
import { useAuthStore } from '@/stores/auth-store';
import { MarketSidebar } from '@/components/trading/MarketSidebar';
import { TradingChart } from '@/components/trading/TradingChart';
import { OrderPanel } from '@/components/trading/OrderPanel';
import { PositionsTable } from '@/components/trading/PositionsTable';
import { WalletModal } from '@/components/wallet/WalletModal';
import { Sparkles } from 'lucide-react';

export function TradePage() {
  const { user } = useAuthStore();
  const { selectedMarket, setSelectedMarket, updateTicker } = useTradingStore();

  const { data: markets = [] } = useQuery({
    queryKey: ['markets'],
    queryFn: () => api.getMarkets(),
    refetchInterval: 30000,
  });

  const { data: marketSummary } = useQuery({
    queryKey: ['market-summary', selectedMarket?.symbol],
    queryFn: () => api.getMarketSummary(selectedMarket!.symbol),
    enabled: !!selectedMarket,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (markets.length && !selectedMarket) {
      setSelectedMarket(markets[0]);
    }
  }, [markets, selectedMarket, setSelectedMarket]);

  useEffect(() => {
    const unsub = realtimeClient.subscribeMarketPrices((ticker) => {
      updateTicker(ticker);
    });
    return () => { unsub?.(); };
  }, [updateTicker]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between px-4 py-1 border-b border-border bg-card/30">
        {marketSummary ? (
          <div className="flex items-center gap-2 text-xs text-muted max-w-2xl truncate">
            <Sparkles className="w-3 h-3 text-accent shrink-0" />
            <span>{marketSummary.summary}</span>
          </div>
        ) : null}
        {user && <WalletModal />}
      </div>

      <div className="flex flex-1 min-h-0">
        <MarketSidebar markets={markets} />
        <TradingChart />
        <OrderPanel />
      </div>
      <PositionsTable />
    </div>
  );
}