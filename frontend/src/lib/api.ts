const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const API_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/platform`
  : (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : ''));

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('sphere-perps-token', token);
    else localStorage.removeItem('sphere-perps-token');
  }

  getToken() {
    if (!this.token) this.token = localStorage.getItem('sphere-perps-token');
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (SUPABASE_ANON_KEY) {
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'Request failed');
    }

    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // Auth
  getNonce = () => this.post<{ nonce: string }>('/auth/nonce');
  verifyAuth = (data: {
    nonce: string;
    message: string;
    signature: string;
    publicKey: string;
    directAddress?: string;
    nametag?: string;
    referralCode?: string;
  }) => this.post<{ token: string; user: User }>('/auth/verify', data);
  getMe = () => this.get<User & { balance: Balance; settings: Settings }>('/auth/me');

  // Markets
  getMarkets = () => this.get<Market[]>('/markets');
  getMarket = (symbol: string) => this.get<Market>(`/markets/${encodeURIComponent(symbol)}`);
  getCandles = (symbol: string, interval: string) =>
    this.get<Candle[]>(`/prices/${encodeURIComponent(symbol)}/candles?interval=${interval}`);
  getTicker = (symbol: string) => this.get<Ticker>(`/prices/${encodeURIComponent(symbol)}`);

  // Trading
  placeOrder = (order: PlaceOrderInput) => this.post('/orders', order);
  getOpenOrders = () => this.get<Order[]>('/orders/open');
  cancelOrder = (id: string) => this.delete(`/orders/${id}`);
  getPositions = (status = 'OPEN') => this.get<Position[]>(`/positions?status=${status}`);
  closePosition = (id: string, size?: number) => this.post(`/positions/${id}/close`, { size });
  getTrades = () => this.get<Trade[]>('/trades');
  getFundingHistory = () => this.get('/trades/funding');
  getStats = () => this.get<PortfolioStats>('/trades/stats');

  // Wallet
  getWallet = () => this.get<WalletInfo>('/wallet');
  deposit = (amount: number, sphereTransferId?: string) =>
    this.post('/deposits', { amount, sphereTransferId });
  withdraw = (amount: number, recipientAddress: string) =>
    this.post('/withdrawals', { amount, recipientAddress });
  getDeposits = () => this.get('/deposits');
  getWithdrawals = () => this.get('/withdrawals');

  // AI
  getMarketSummary = (symbol: string) => this.get<MarketSummary>(`/ai/market-summary/${encodeURIComponent(symbol)}`);
  getRiskScore = (data: RiskScoreInput) => this.post('/ai/risk-score', data);
  getNewsSummary = () => this.get('/ai/news-summary');
  getJournal = () => this.get<TradeJournalEntry[]>('/ai/journal');

  // Leaderboard
  getLeaderboard = (period: string, sortBy?: string) =>
    this.get<LeaderboardEntry[]>(`/leaderboard/${period}${sortBy ? `?sortBy=${sortBy}` : ''}`);
  getReferrals = () => this.get<ReferralInfo>('/leaderboard/user/referrals');

  // Notifications
  getNotifications = () => this.get('/notifications');
  markNotificationsRead = (ids: string[]) => this.post('/notifications/read', { ids });
  getAchievements = () => this.get<UserAchievement[]>('/notifications/achievements');

  // Admin
  getAdminDashboard = () => this.get('/admin/dashboard');
  getAdminUsers = () => this.get('/admin/users');
  updateSystemSettings = (data: Partial<SystemSettings>) => this.patch('/admin/settings', data);
  getAdminMarkets = () => this.get('/admin/markets');
  updateMarket = (id: string, data: Partial<Market>) => this.patch(`/admin/markets/${id}`, data);
}

export const api = new ApiClient();

export interface User {
  id: string;
  chainPubkey: string;
  directAddress?: string;
  nametag?: string;
  referralCode: string;
  isAdmin: boolean;
}

export interface Balance {
  available: number;
  locked: number;
  totalDeposited: number;
  totalWithdrawn: number;
  realizedPnl: number;
}

export interface Settings {
  defaultLeverage: number;
  defaultMarginMode: 'CROSS' | 'ISOLATED';
  favoriteMarkets: string[];
  recentMarkets: string[];
}

export interface Market {
  id: string;
  symbol: string;
  baseAsset: string;
  binanceSymbol: string;
  maxLeverage: number;
  minOrderSize: number;
  price?: number;
  change24h?: number;
  volume24h?: number;
  fundingRate?: number;
  nextFundingAt?: string;
  isTrending?: boolean;
}

export interface Ticker {
  symbol: string;
  price: number;
  markPrice: number;
  change24h: number;
  volume24h: number;
  fundingRate: number;
  nextFundingAt: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PlaceOrderInput {
  marketId: string;
  type: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  size: number;
  price?: number;
  leverage: number;
  marginMode?: 'CROSS' | 'ISOLATED';
  stopLoss?: number;
  takeProfit?: number;
}

export interface Position {
  id: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  marginUsed: number;
  unrealizedPnl: number;
  roe: number;
  leverage: number;
  marginMode: string;
  stopLoss?: number;
  takeProfit?: number;
  market: Market;
  liveMarkPrice?: number;
  liveMetrics?: {
    unrealizedPnl: number;
    roe: number;
    liquidationPrice: number;
  };
}

export interface Order {
  id: string;
  type: string;
  side: string;
  size: number;
  price?: number;
  status: string;
  leverage: number;
  market: Market;
  createdAt: string;
}

export interface Trade {
  id: string;
  side: string;
  size: number;
  price: number;
  fee: number;
  realizedPnl: number;
  market: Market;
  createdAt: string;
}

export interface WalletInfo {
  tradingBalance: number;
  lockedBalance: number;
  treasuryNametag: string;
  treasuryAddress?: string;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

export interface PortfolioStats {
  portfolioValue: number;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  winRate: number;
  averageRR: number;
  largestWin: number;
  largestLoss: number;
  totalTrades: number;
  totalVolume: number;
}

export interface RiskScoreInput {
  symbol: string;
  side: string;
  leverage: number;
  size: number;
  price?: number;
}

export interface SystemSettings {
  tradingEnabled: boolean;
  maxLeverage: number;
  maintenanceMode: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
}

export interface TradeJournalEntry {
  id: string;
  summary: string;
  analysis: string;
  position: { market: { symbol: string } };
}

export interface UserAchievement {
  achievement: { name: string; description: string; icon?: string };
}

export interface LeaderboardEntry {
  rank: number;
  pnl: number;
  roi: number;
  winRate: number;
  volume: number;
  user: { nametag?: string; chainPubkey: string };
}

export interface ReferralInfo {
  referralCode: string;
  referrals: Array<{ id: string; nametag?: string; createdAt: string }>;
  rewards: Array<{ amount: number; type: string }>;
}

export interface MarketSummary {
  summary: string;
  sentiment: string;
}