import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTradingStore } from '@/stores/trading-store';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { cn, formatPrice } from '@/lib/utils';
import { AlertTriangle, Sparkles } from 'lucide-react';

const LEVERAGES = [1, 2, 5, 10, 20, 50, 100];

export function OrderPanel() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const {
    selectedMarket, orderType, orderSide, orderSize, orderPrice,
    leverage, marginMode, stopLoss, takeProfit,
    setOrderType, setOrderSide, setOrderSize, setOrderPrice,
    setLeverage, setMarginMode, setStopLoss, setTakeProfit, tickers,
  } = useTradingStore();

  const [showConfirm, setShowConfirm] = useState(false);
  const [riskAssessment, setRiskAssessment] = useState<{
    explanation?: string;
    risk?: string;
  } | null>(null);

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    enabled: !!user,
  });

  const ticker = selectedMarket ? tickers[selectedMarket.symbol] : null;
  const price = ticker?.price ?? selectedMarket?.price ?? 0;
  const size = parseFloat(orderSize) || 0;
  const notional = size * (orderType === 'LIMIT' ? parseFloat(orderPrice) || price : price);
  const marginRequired = notional / leverage;
  const estLiqPrice = orderSide === 'BUY'
    ? price * (1 - 1 / leverage + 0.005)
    : price * (1 + 1 / leverage - 0.005);

  const placeOrder = useMutation({
    mutationFn: () =>
      api.placeOrder({
        marketId: selectedMarket!.id,
        type: orderType,
        side: orderSide,
        size,
        price: orderType === 'LIMIT' ? parseFloat(orderPrice) : undefined,
        leverage,
        marginMode,
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setShowConfirm(false);
      setOrderSize('');
    },
  });

  const assessRisk = async () => {
    if (!selectedMarket || !size) return;
    const assessment = await api.getRiskScore({
      symbol: selectedMarket.symbol,
      side: orderSide,
      leverage,
      size,
      price,
    }) as { explanation?: string; risk?: string };
    setRiskAssessment(assessment);
    setShowConfirm(true);
  };

  if (!selectedMarket) {
    return (
      <aside className="w-80 border-l border-border p-4 text-muted text-sm">
        Select a market to trade
      </aside>
    );
  }

  return (
    <aside className="w-80 border-l border-border flex flex-col shrink-0 panel-surface">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex gap-1 bg-card rounded-lg p-1">
          {(['MARKET', 'LIMIT'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                orderType === t ? 'bg-border-light' : 'text-muted',
              )}
            >
              {t === 'MARKET' ? 'Market' : 'Limit'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1">
          <Button
            variant={orderSide === 'BUY' ? 'long' : 'outline'}
            onClick={() => setOrderSide('BUY')}
            className="w-full"
          >
            Buy / Long
          </Button>
          <Button
            variant={orderSide === 'SELL' ? 'short' : 'outline'}
            onClick={() => setOrderSide('SELL')}
            className="w-full"
          >
            Sell / Short
          </Button>
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Leverage: {leverage}x</label>
          <div className="flex flex-wrap gap-1">
            {LEVERAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md border transition-colors',
                  leverage === l ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted',
                )}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 bg-card rounded-lg p-1">
          {(['CROSS', 'ISOLATED'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMarginMode(m)}
              className={cn(
                'flex-1 py-1 text-xs rounded-md transition-colors',
                marginMode === m ? 'bg-border-light' : 'text-muted',
              )}
            >
              {m === 'CROSS' ? 'Cross' : 'Isolated'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Size ({selectedMarket.baseAsset})</label>
          <Input
            type="number"
            placeholder="0.00"
            value={orderSize}
            onChange={(e) => setOrderSize(e.target.value)}
          />
        </div>

        {orderType === 'LIMIT' && (
          <div>
            <label className="text-xs text-muted mb-1 block">Limit Price</label>
            <Input
              type="number"
              value={orderPrice}
              onChange={(e) => setOrderPrice(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted mb-1 block">Stop Loss</label>
            <Input type="number" placeholder="Optional" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Take Profit</label>
            <Input type="number" placeholder="Optional" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2 p-3 rounded-lg bg-card text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Available</span>
            <span className="font-mono">${wallet?.tradingBalance?.toFixed(2) ?? '0.00'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Margin Required</span>
            <span className="font-mono">${marginRequired.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Est. Liquidation</span>
            <span className="font-mono text-short">{formatPrice(estLiqPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Notional</span>
            <span className="font-mono">${notional.toFixed(2)}</span>
          </div>
        </div>

        {riskAssessment && (
          <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 text-xs space-y-1">
            <div className="flex items-center gap-1 text-accent font-medium">
              <Sparkles className="w-3 h-3" /> AI Risk Score
            </div>
            <p>{riskAssessment.explanation}</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border">
        <Button
          variant={orderSide === 'BUY' ? 'long' : 'short'}
          className="w-full"
          size="lg"
          disabled={!user || !size || placeOrder.isPending}
          onClick={assessRisk}
        >
          {orderSide === 'BUY' ? 'Open Long' : 'Open Short'}
        </Button>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted">Market</span><span>{selectedMarket.symbol}</span>
              <span className="text-muted">Side</span><span className={orderSide === 'BUY' ? 'text-long' : 'text-short'}>{orderSide}</span>
              <span className="text-muted">Size</span><span>{size} {selectedMarket.baseAsset}</span>
              <span className="text-muted">Leverage</span><span>{leverage}x</span>
              <span className="text-muted">Margin</span><span>${marginRequired.toFixed(2)}</span>
            </div>
            {riskAssessment && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{riskAssessment.explanation}</span>
              </div>
            )}
            <Button
              variant={orderSide === 'BUY' ? 'long' : 'short'}
              className="w-full"
              onClick={() => placeOrder.mutate()}
              disabled={placeOrder.isPending}
            >
              {placeOrder.isPending ? 'Placing...' : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}