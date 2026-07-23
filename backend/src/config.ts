import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  sphere: {
    oracleApiKey: process.env.SPHERE_ORACLE_API_KEY ?? 'sk_ddc3cfcc001e4a28ac3fad7407f99590',
    walletApiUrl: process.env.SPHERE_WALLET_API_URL ?? 'https://wallet-api.unicity.network',
    treasuryNametag: process.env.SPHERE_TREASURY_NAMETAG ?? 'sphere-perps-treasury',
    treasuryMnemonic: process.env.SPHERE_TREASURY_MNEMONIC,
    dataDir: process.env.SPHERE_DATA_DIR ?? './sphere-data',
    deviceId: process.env.SPHERE_DEVICE_ID ?? 'sphere-perps-backend',
    // testnet2 UCT native coin (lowercase 64-hex). Symbol "UCT" resolves in SDK payments.send.
    uctCoinId:
      process.env.SPHERE_UCT_COIN_ID ??
      'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0',
  },
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'mock') as 'mock' | 'openai' | 'spacexai',
    apiKey: process.env.AI_API_KEY,
  },
  adminWalletPubkeys: (process.env.ADMIN_WALLET_PUBKEYS ?? '').split(',').filter(Boolean),
  trading: {
    takerFeeRate: 0.0006,
    makerFeeRate: 0.0002,
    defaultMaintenanceMargin: 0.005,
    liquidationBuffer: 0.001,
  },
} as const;