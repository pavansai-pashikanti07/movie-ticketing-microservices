import { redis, checkRedisHealth } from '../config/redis';

// Fallback in-memory map if Redis is temporarily offline in local dev
const localLockStore = new Map<string, { userId: number; expiresAt: number }>();

export class SeatLockService {
  private static getKey(showId: number, seatNumber: string): string {
    return `lock:show:${showId}:seat:${seatNumber.toUpperCase()}`;
  }

  /**
   * Atomically acquires 5-minute locks across all requested seats.
   * If any single seat fails (already held by someone else), rolls back all previously acquired locks in the batch.
   */
  public static async acquireSeatLocks(
    showId: number,
    seats: string[],
    userId: number,
    ttlSeconds = 300
  ): Promise<{ success: boolean; conflictingSeat?: string }> {
    const isRedisReady = checkRedisHealth();
    const acquiredKeys: string[] = [];

    if (isRedisReady) {
      try {
        for (const seat of seats) {
          const key = this.getKey(showId, seat);
          // Atomic SET if Not eXists with EXpiration
          const result = await redis.set(key, String(userId), 'EX', ttlSeconds, 'NX');

          if (result !== 'OK') {
            // Collision detected! Roll back all locks acquired in this batch
            if (acquiredKeys.length > 0) {
              await redis.del(...acquiredKeys);
            }
            return { success: false, conflictingSeat: seat };
          }

          acquiredKeys.push(key);
        }
        return { success: true };
      } catch (err) {
        console.error('[SeatLockService.acquireSeatLocks] Redis error, using fallback:', err);
      }
    }

    // Fallback: Local In-Memory Atomic Lock Map
    const now = Date.now();
    for (const seat of seats) {
      const key = this.getKey(showId, seat);
      const existing = localLockStore.get(key);

      if (existing && existing.expiresAt > now) {
        // Rollback
        for (const rollbackKey of acquiredKeys) {
          localLockStore.delete(rollbackKey);
        }
        return { success: false, conflictingSeat: seat };
      }

      localLockStore.set(key, { userId, expiresAt: now + ttlSeconds * 1000 });
      acquiredKeys.push(key);
    }

    return { success: true };
  }

  /**
   * Releases atomic locks on seats (e.g. when customer cancels or confirms payment)
   */
  public static async releaseSeatLocks(showId: number, seats: string[]): Promise<void> {
    const isRedisReady = checkRedisHealth();
    const keys = seats.map((seat) => this.getKey(showId, seat));

    if (isRedisReady) {
      try {
        await redis.del(...keys);
      } catch (err) {
        console.error('[SeatLockService.releaseSeatLocks] Redis delete error:', err);
      }
    }

    // Also clear from local fallback
    for (const key of keys) {
      localLockStore.delete(key);
    }
  }

  /**
   * Returns a list of currently held seat numbers for a given show
   */
  public static async getHeldSeats(showId: number): Promise<string[]> {
    const isRedisReady = checkRedisHealth();
    const prefix = `lock:show:${showId}:seat:`;
    const heldSeats: string[] = [];

    if (isRedisReady) {
      try {
        const keys = await redis.keys(`${prefix}*`);
        for (const key of keys) {
          heldSeats.push(key.replace(prefix, ''));
        }
        return heldSeats;
      } catch (err) {
        console.error('[SeatLockService.getHeldSeats] Redis scan error:', err);
      }
    }

    // Local fallback check
    const now = Date.now();
    for (const [key, val] of localLockStore.entries()) {
      if (key.startsWith(prefix) && val.expiresAt > now) {
        heldSeats.push(key.replace(prefix, ''));
      }
    }

    return heldSeats;
  }
}
