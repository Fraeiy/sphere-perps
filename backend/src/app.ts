import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { walletRouter } from './routes/wallet.js';
import { createMarketsRouter } from './routes/markets.js';
import { createPricesRouter } from './routes/prices.js';
import { createOrdersRouter } from './routes/orders.js';
import { createPositionsRouter } from './routes/positions.js';
import { tradesRouter } from './routes/trades.js';
import { depositsRouter } from './routes/deposits.js';
import { withdrawalsRouter } from './routes/withdrawals.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { createAiRouter } from './routes/ai.js';
import { adminRouter } from './routes/admin.js';
import { notificationsRouter } from './routes/notifications.js';
import type { PriceFeedService } from './services/price-feed.js';
import type { TradingEngine } from './services/trading-engine.js';

export function createApp(priceFeed: PriceFeedService, tradingEngine: TradingEngine) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/auth', authRouter);
  app.use('/wallet', walletRouter);
  app.use('/markets', createMarketsRouter(priceFeed));
  app.use('/prices', createPricesRouter(priceFeed));
  app.use('/orders', createOrdersRouter(tradingEngine));
  app.use('/positions', createPositionsRouter(tradingEngine, priceFeed));
  app.use('/trades', tradesRouter);
  app.use('/deposits', depositsRouter);
  app.use('/withdrawals', withdrawalsRouter);
  app.use('/leaderboard', leaderboardRouter);
  app.use('/ai', createAiRouter(priceFeed));
  app.use('/admin', adminRouter);
  app.use('/notifications', notificationsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}