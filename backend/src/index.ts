import { createServer } from 'http';
import { config } from './config.js';
import { createApp } from './app.js';
import { connectDatabase } from './lib/db.js';
import { PriceFeedService } from './services/price-feed.js';
import { TradingEngine } from './services/trading-engine.js';
import { LiquidationService } from './services/liquidation.js';
import { FundingService } from './services/funding.js';
import { SphereService } from './services/sphere.js';
import { NotificationService } from './services/notification.js';
import { WsHub } from './websocket/hub.js';
import { LeaderboardService } from './services/leaderboard.js';

async function main() {
  console.log('[Server] Starting Sphere Perps API...');

  await connectDatabase();

  const priceFeed = new PriceFeedService();
  const tradingEngine = new TradingEngine(priceFeed);
  const liquidationService = new LiquidationService(priceFeed);
  const fundingService = new FundingService(priceFeed);

  const app = createApp(priceFeed, tradingEngine);
  const server = createServer(app);
  const wsHub = new WsHub(server);
  NotificationService.setWsHub(wsHub);

  server.listen(config.port, () => {
    console.log(`[Server] API running on http://localhost:${config.port}`);
    console.log(`[Server] WebSocket at ws://localhost:${config.port}/ws`);
  });

  SphereService.initTreasury().catch((err) => {
    console.warn('[Sphere] Treasury init skipped:', err instanceof Error ? err.message : err);
  });

  try {
    await priceFeed.start();
    console.log('[PriceFeed] Connected to Binance Futures');
  } catch (err) {
    console.error('[PriceFeed] Failed to start:', err instanceof Error ? err.message : err);
  }

  priceFeed.on('ticker', (ticker) => {
    wsHub.broadcast('ticker', ticker);
  });

  priceFeed.on('markPrice', async ({ symbol, markPrice }) => {
    wsHub.broadcast(`mark:${symbol}`, { symbol, markPrice });
    try {
      await liquidationService.updatePositions(symbol, markPrice);
      await tradingEngine.processLimitOrders(symbol, markPrice);
      await tradingEngine.checkStopOrders(symbol, markPrice);
    } catch (err) {
      console.error(`[Engine] Error processing ${symbol}:`, err);
    }
  });

  priceFeed.on('funding', async ({ symbol }) => {
    try {
      await fundingService.processFunding(symbol);
    } catch (err) {
      console.error(`[Funding] Error for ${symbol}:`, err);
    }
  });

  setInterval(() => {
    LeaderboardService.refresh('daily').catch(console.error);
  }, 60 * 60 * 1000);

  const shutdown = async () => {
    priceFeed.stop();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});