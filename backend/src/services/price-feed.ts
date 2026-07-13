import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { prisma } from '../lib/prisma.js';
import { D } from '../lib/decimal.js';

export interface TickerData {
  symbol: string;
  price: number;
  markPrice: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  fundingRate: number;
  nextFundingAt: Date;
}

export interface CandleData {
  symbol: string;
  interval: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BINANCE_WS = 'wss://fstream.binance.com/ws';
const BINANCE_REST = 'https://fapi.binance.com';

export class PriceFeedService extends EventEmitter {
  private ws: WebSocket | null = null;
  private tickers = new Map<string, TickerData>();
  private candles = new Map<string, CandleData[]>();
  private symbols: string[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private fundingTimers = new Map<string, NodeJS.Timeout>();

  async start() {
    const markets = await prisma.market.findMany({ where: { isActive: true } });
    this.symbols = markets.map((m) => m.binanceSymbol.toLowerCase());

    for (const market of markets) {
      this.tickers.set(market.symbol, {
        symbol: market.symbol,
        price: 0,
        markPrice: 0,
        change24h: 0,
        volume24h: 0,
        high24h: 0,
        low24h: 0,
        fundingRate: market.fundingRate.toNumber(),
        nextFundingAt: this.getNextFundingTime(market.fundingIntervalHours),
      });
      this.scheduleFunding(market.symbol, market.id);
    }

    this.connect();
  }

  private connect() {
    if (this.symbols.length === 0) return;

    const streams = this.symbols.flatMap((s) => [
      `${s}@ticker`,
      `${s}@markPrice@1s`,
    ]);
    const url = `${BINANCE_WS}/${streams.join('/')}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[PriceFeed] Connected to Binance WebSocket');
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // Combined stream wraps data
        try {
          const wrapped = JSON.parse(data.toString());
          if (wrapped.data) this.handleMessage(wrapped.data);
        } catch {
          /* ignore */
        }
      }
    });

    this.ws.on('close', () => {
      console.log('[PriceFeed] Disconnected, reconnecting...');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[PriceFeed] Error:', err.message);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private async handleMessage(msg: Record<string, unknown>) {
    const eventType = msg.e as string;

    if (eventType === '24hrTicker') {
      await this.handleTicker(msg);
    } else if (eventType === 'markPriceUpdate') {
      await this.handleMarkPrice(msg);
    }
  }

  private async handleTicker(msg: Record<string, unknown>) {
    const binanceSymbol = (msg.s as string).toUpperCase();
    const market = await prisma.market.findFirst({ where: { binanceSymbol } });
    if (!market) return;

    const price = parseFloat(msg.c as string);
    const change24h = parseFloat(msg.P as string);
    const volume24h = parseFloat(msg.q as string);
    const high24h = parseFloat(msg.h as string);
    const low24h = parseFloat(msg.l as string);

    const existing = this.tickers.get(market.symbol);
    const ticker: TickerData = {
      symbol: market.symbol,
      price,
      markPrice: existing?.markPrice || price,
      change24h,
      volume24h,
      high24h,
      low24h,
      fundingRate: existing?.fundingRate ?? market.fundingRate.toNumber(),
      nextFundingAt: existing?.nextFundingAt ?? this.getNextFundingTime(market.fundingIntervalHours),
    };

    this.tickers.set(market.symbol, ticker);
    this.emit('ticker', ticker);
  }

  private async handleMarkPrice(msg: Record<string, unknown>) {
    const market = await prisma.market.findFirst({
      where: { binanceSymbol: msg.s as string },
    });
    if (!market) return;
    this.updateMarkPrice(market.symbol, parseFloat(msg.p as string));
  }

  private updateMarkPrice(symbol: string, markPrice: number) {
    const existing = this.tickers.get(symbol);
    if (existing) {
      existing.markPrice = markPrice;
      if (!existing.price) existing.price = markPrice;
      this.tickers.set(symbol, existing);
      this.emit('markPrice', { symbol, markPrice });
    }
  }

  getMarkPrice(symbol: string): number | null {
    const ticker = this.tickers.get(symbol);
    return ticker?.markPrice || ticker?.price || null;
  }

  getTicker(symbol: string): TickerData | null {
    return this.tickers.get(symbol) ?? null;
  }

  getAllTickers(): TickerData[] {
    return Array.from(this.tickers.values());
  }

  async fetchCandles(symbol: string, interval: string, limit = 500): Promise<CandleData[]> {
    const market = await prisma.market.findUnique({ where: { symbol } });
    if (!market) return [];

    const cacheKey = `${symbol}:${interval}`;
    try {
      const res = await fetch(
        `${BINANCE_REST}/fapi/v1/klines?symbol=${market.binanceSymbol}&interval=${interval}&limit=${limit}`,
      );
      const data = (await res.json()) as Array<[number, string, string, string, string, string]>;

      const candles: CandleData[] = data.map((k) => ({
        symbol,
        interval,
        time: k[0] / 1000,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      this.candles.set(cacheKey, candles);
      return candles;
    } catch (err) {
      console.error('[PriceFeed] Failed to fetch candles:', err);
      return this.candles.get(cacheKey) ?? [];
    }
  }

  private getNextFundingTime(intervalHours: number): Date {
    const now = new Date();
    const hours = now.getUTCHours();
    const nextHour = Math.ceil(hours / intervalHours) * intervalHours;
    const next = new Date(now);
    next.setUTCHours(nextHour % 24, 0, 0, 0);
    if (next <= now) next.setUTCHours(next.getUTCHours() + intervalHours);
    return next;
  }

  private scheduleFunding(symbol: string, marketId: string) {
    const timer = setInterval(async () => {
      const ticker = this.tickers.get(symbol);
      if (!ticker) return;

      await prisma.priceSnapshot.create({
        data: {
          marketId,
          price: D(ticker.price),
          markPrice: D(ticker.markPrice),
          indexPrice: D(ticker.price),
          change24h: D(ticker.change24h),
          volume24h: D(ticker.volume24h),
          high24h: D(ticker.high24h),
          low24h: D(ticker.low24h),
          fundingRate: D(ticker.fundingRate),
          nextFundingAt: ticker.nextFundingAt,
        },
      });

      ticker.nextFundingAt = this.getNextFundingTime(8);
      this.emit('funding', { symbol, rate: ticker.fundingRate });
    }, 8 * 60 * 60 * 1000);

    this.fundingTimers.set(symbol, timer);
  }

  stop() {
    this.ws?.close();
    this.fundingTimers.forEach((t) => clearInterval(t));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }
}