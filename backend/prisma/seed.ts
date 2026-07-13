import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MARKETS = [
  { symbol: 'BTC/USD', baseAsset: 'BTC', binanceSymbol: 'BTCUSDT', sortOrder: 1, isTrending: true },
  { symbol: 'ETH/USD', baseAsset: 'ETH', binanceSymbol: 'ETHUSDT', sortOrder: 2, isTrending: true },
  { symbol: 'SOL/USD', baseAsset: 'SOL', binanceSymbol: 'SOLUSDT', sortOrder: 3, isTrending: true },
  { symbol: 'BNB/USD', baseAsset: 'BNB', binanceSymbol: 'BNBUSDT', sortOrder: 4 },
  { symbol: 'SUI/USD', baseAsset: 'SUI', binanceSymbol: 'SUIUSDT', sortOrder: 5 },
  { symbol: 'DOGE/USD', baseAsset: 'DOGE', binanceSymbol: 'DOGEUSDT', sortOrder: 6 },
];

const ACHIEVEMENTS = [
  { code: 'FIRST_TRADE', name: 'First Trade', description: 'Complete your first trade', category: 'trading', icon: '🎯' },
  { code: 'FIRST_PROFIT', name: 'First Profit', description: 'Close your first profitable trade', category: 'trading', icon: '💰' },
  { code: 'TEN_WINS', name: '10 Winning Trades', description: 'Win 10 trades', category: 'trading', icon: '🏆', threshold: 10 },
  { code: 'HUNDRED_TRADES', name: '100 Trades', description: 'Complete 100 trades', category: 'milestone', icon: '💎', threshold: 100 },
  { code: 'DIAMOND_HANDS', name: 'Diamond Hands', description: 'Hold a position for 7+ days', category: 'holding', icon: '💎' },
  { code: 'HIGH_LEVERAGE', name: 'High Leverage', description: 'Trade with 50x+ leverage', category: 'risk', icon: '⚡' },
  { code: 'CONSISTENT_TRADER', name: 'Consistent Trader', description: 'Trade 7 days in a row', category: 'streak', icon: '🔥' },
];

async function main() {
  console.log('Seeding database...');

  await prisma.systemSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global' },
    update: {},
  });

  for (const market of MARKETS) {
    await prisma.market.upsert({
      where: { symbol: market.symbol },
      create: {
        symbol: market.symbol,
        baseAsset: market.baseAsset,
        binanceSymbol: market.binanceSymbol,
        tickSize: 0.01,
        lotSize: 0.001,
        minOrderSize: 0.001,
        maxLeverage: 100,
        maintenanceMargin: 0.005,
        initialMargin: 0.01,
        fundingRate: 0.0001,
        sortOrder: market.sortOrder,
        isTrending: market.isTrending ?? false,
      },
      update: { sortOrder: market.sortOrder, isTrending: market.isTrending ?? false },
    });
  }

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      create: achievement,
      update: achievement,
    });
  }

  await prisma.competition.upsert({
    where: { id: 'launch-competition' },
    create: {
      id: 'launch-competition',
      name: 'Launch Week Trading Competition',
      description: 'Top traders by PnL win UCT rewards',
      status: 'ACTIVE',
      startAt: new Date(),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      prizePool: 10000,
      rules: { metric: 'pnl', minTrades: 5 },
    },
    update: {},
  });

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());