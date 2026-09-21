import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 1000);
  },
});

let isRedisConnected = false;

redis.on('connect', () => {
  isRedisConnected = true;
  console.log(`[Redis] Booking Seat-Locking Engine connected at ${REDIS_HOST}:${REDIS_PORT}`);
});

redis.on('error', (err) => {
  isRedisConnected = false;
  // Non-blocking log
  // console.warn('[Redis] Seat-lock warning:', err.message);
});

export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch {
    console.log('[Redis] Running in local/mock mode (Redis cluster starting)');
  }
};

export const checkRedisHealth = (): boolean => isRedisConnected;
