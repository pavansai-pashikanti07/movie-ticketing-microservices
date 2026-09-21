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
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => {
    // Retry up to 3 times, then back off without crashing the app
    if (times > 3) {
      return null;
    }
    return Math.min(times * 100, 1000);
  },
});

let isRedisConnected = false;

redis.on('connect', () => {
  isRedisConnected = true;
  console.log(`[Redis] Connected to ElastiCache / Redis at ${REDIS_HOST}:${REDIS_PORT}`);
});

redis.on('error', (err) => {
  isRedisConnected = false;
  // Non-blocking warning: Cache-aside fallback to database
  // console.warn('[Redis] Connection degraded. Falling back to DB:', err.message);
});

export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch {
    console.log('[Redis] Running in DB-direct fallback mode (Redis unavailable)');
  }
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!isRedisConnected) return null;
  try {
    const data = await redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
};

export const setCache = async (key: string, data: any, ttlSeconds = 300): Promise<void> => {
  if (!isRedisConnected) return;
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch {
    // Ignore cache set errors
  }
};

export const invalidateCache = async (pattern: string): Promise<void> => {
  if (!isRedisConnected) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore cache invalidate errors
  }
};

export const checkRedisHealth = (): boolean => isRedisConnected;
