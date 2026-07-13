import { create } from 'zustand';
import type { Market, Ticker } from '@/lib/api';

interface TradingState {
  selectedMarket: Market | null;
  tickers: Record<string, Ticker>;
  favorites: string[];
  recentMarkets: string[];
  leverage: number;
  marginMode: 'CROSS' | 'ISOLATED';
  orderType: 'MARKET' | 'LIMIT';
  orderSide: 'BUY' | 'SELL';
  orderSize: string;
  orderPrice: string;
  stopLoss: string;
  takeProfit: string;
  setSelectedMarket: (market: Market) => void;
  updateTicker: (ticker: Ticker) => void;
  setLeverage: (leverage: number) => void;
  setMarginMode: (mode: 'CROSS' | 'ISOLATED') => void;
  setOrderType: (type: 'MARKET' | 'LIMIT') => void;
  setOrderSide: (side: 'BUY' | 'SELL') => void;
  setOrderSize: (size: string) => void;
  setOrderPrice: (price: string) => void;
  setStopLoss: (sl: string) => void;
  setTakeProfit: (tp: string) => void;
  toggleFavorite: (symbol: string) => void;
}

export const useTradingStore = create<TradingState>((set, get) => ({
  selectedMarket: null,
  tickers: {},
  favorites: JSON.parse(localStorage.getItem('favorites') ?? '[]'),
  recentMarkets: JSON.parse(localStorage.getItem('recent') ?? '[]'),
  leverage: 10,
  marginMode: 'CROSS',
  orderType: 'MARKET',
  orderSide: 'BUY',
  orderSize: '',
  orderPrice: '',
  stopLoss: '',
  takeProfit: '',

  setSelectedMarket: (market) => {
    const recent = [market.symbol, ...get().recentMarkets.filter((s) => s !== market.symbol)].slice(0, 5);
    localStorage.setItem('recent', JSON.stringify(recent));
    set({ selectedMarket: market, recentMarkets: recent, orderPrice: String(market.price ?? '') });
  },

  updateTicker: (ticker) =>
    set((s) => ({ tickers: { ...s.tickers, [ticker.symbol]: ticker } })),

  setLeverage: (leverage) => set({ leverage }),
  setMarginMode: (marginMode) => set({ marginMode }),
  setOrderType: (orderType) => set({ orderType }),
  setOrderSide: (orderSide) => set({ orderSide }),
  setOrderSize: (orderSize) => set({ orderSize }),
  setOrderPrice: (orderPrice) => set({ orderPrice }),
  setStopLoss: (stopLoss) => set({ stopLoss }),
  setTakeProfit: (takeProfit) => set({ takeProfit }),

  toggleFavorite: (symbol) => {
    const favs = get().favorites;
    const next = favs.includes(symbol) ? favs.filter((s) => s !== symbol) : [...favs, symbol];
    localStorage.setItem('favorites', JSON.stringify(next));
    set({ favorites: next });
  },
}));