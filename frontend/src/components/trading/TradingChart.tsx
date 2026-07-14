import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTradingStore } from '@/stores/trading-store';
import { cn, formatPrice, formatPercent, timeUntil } from '@/lib/utils';
import { Maximize2, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
const INDICATORS = ['EMA', 'VWAP', 'RSI', 'MACD'] as const;

export function TradingChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['EMA']);
  const { selectedMarket, tickers } = useTradingStore();

  const ticker = selectedMarket ? tickers[selectedMarket.symbol] : null;

  const { data: candles } = useQuery({
    queryKey: ['candles', selectedMarket?.symbol, timeframe],
    queryFn: () => api.getCandles(selectedMarket!.symbol, timeframe),
    enabled: !!selectedMarket,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8a7f72',
        fontFamily: 'JetBrains Mono',
      },
      grid: {
        vertLines: { color: '#2a2420' },
        horzLines: { color: '#2a2420' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2a2420' },
      timeScale: { borderColor: '#2a2420', timeVisible: true },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartApi.current = chart;
    seriesRef.current = series;

    const resize = () => {
      if (chartRef.current) {
        chart.applyOptions({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, [selectedMarket?.symbol]);

  useEffect(() => {
    if (!seriesRef.current || !candles?.length) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as unknown as import('lightweight-charts').UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chartApi.current?.timeScale().fitContent();
  }, [candles]);

  if (!selectedMarket) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Select a market to view chart
      </div>
    );
  }

  const price = ticker?.price ?? selectedMarket.price ?? 0;
  const change = ticker?.change24h ?? selectedMarket.change24h ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-bold">{selectedMarket.symbol}</h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl">{formatPrice(price)}</span>
              <span className={cn('font-mono text-sm', change >= 0 ? 'text-long' : 'text-short')}>
                {formatPercent(change)}
              </span>
            </div>
          </div>
          {ticker && (
            <div className="hidden lg:flex items-center gap-4 text-xs text-muted">
              <span>Vol: ${(ticker.volume24h / 1e6).toFixed(1)}M</span>
              <span>Funding: {(ticker.fundingRate * 100).toFixed(4)}%</span>
              <span>Next: {timeUntil(ticker.nextFundingAt)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-card rounded-lg p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md transition-colors',
                  timeframe === tf ? 'bg-border-light text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {tf}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon"><Crosshair className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon"><Maximize2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex gap-1 px-4 py-1 border-b border-border">
        {INDICATORS.map((ind) => (
          <button
            key={ind}
            onClick={() =>
              setActiveIndicators((prev) =>
                prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind],
              )
            }
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              activeIndicators.includes(ind) ? 'text-accent' : 'text-muted hover:text-foreground',
            )}
          >
            {ind}
          </button>
        ))}
        <span className="text-xs text-muted ml-2">Drawing tools — coming soon</span>
      </div>

      <div ref={chartRef} className="flex-1 min-h-[300px]" />
    </div>
  );
}