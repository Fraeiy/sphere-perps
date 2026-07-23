import { prisma } from './prisma.js';

// Neon free tier scale-to-zero can take several seconds to wake
const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 2000;

export async function connectDatabase(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      console.log('[Database] Connected');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Database] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}`);

      if (attempt === MAX_RETRIES) {
        throw new Error(
          'Could not connect to database. Run: cd backend && npm run db:push && npm run db:seed',
        );
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}