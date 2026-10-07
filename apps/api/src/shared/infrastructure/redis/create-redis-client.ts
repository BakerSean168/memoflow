/**
 * Optional shared Redis client for API composition (auth challenges, etc.).
 * Lazy-connects via ioredis when AUTH_CHALLENGE_STORE=redis (or callers request it).
 */

import Redis from 'ioredis';
import { getRedisConfig } from '../config/env.js';

export type ApiRedisClient = Redis;

let sharedClient: Redis | null = null;

/**
 * Create (or reuse) an ioredis client from env REDIS_URL / REDIS_*.
 * Callers that only need single-instance memory stores should not call this.
 */
export function createApiRedisClient(options?: {
  /** Force a new client instead of the process singleton. */
  fresh?: boolean;
  lazyConnect?: boolean;
  commandTimeout?: number;
}): Redis {
  if (!options?.fresh && sharedClient) {
    return sharedClient;
  }

  const cfg = getRedisConfig();
  const client =
    'url' in cfg && cfg.url
      ? new Redis(cfg.url, {
          maxRetriesPerRequest: 3,
          commandTimeout: options?.commandTimeout,
          lazyConnect: options?.lazyConnect ?? true,
          enableOfflineQueue: false,
        })
      : new Redis({
          host: cfg.host,
          port: cfg.port,
          password: cfg.password || undefined,
          db: cfg.db,
          maxRetriesPerRequest: 3,
          commandTimeout: options?.commandTimeout,
          lazyConnect: options?.lazyConnect ?? true,
          enableOfflineQueue: false,
        });

  if (!options?.fresh) {
    sharedClient = client;
  }
  return client;
}

/** Whether env asks for Redis-backed auth challenges. */
export function shouldUseRedisChallengeStore(
  env: { AUTH_CHALLENGE_STORE?: string } = process.env,
): boolean {
  return (env.AUTH_CHALLENGE_STORE ?? '').trim().toLowerCase() === 'redis';
}

/** Disconnect shared client (tests / shutdown). */
export async function disposeApiRedisClient(): Promise<void> {
  if (!sharedClient) return;
  const c = sharedClient;
  sharedClient = null;
  try {
    await c.quit();
  } catch {
    c.disconnect();
  }
}
