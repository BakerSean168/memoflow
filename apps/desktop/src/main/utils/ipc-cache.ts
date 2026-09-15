/**
 * @file IPC Cache
 * @description
 * Provides caching mechanism for IPC responses using an LRU (Least Recently Used) strategy.
 * This helps in reducing redundant computations and database queries for frequently accessed data.
 *
 * @module utils/ipc-cache
 */

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  CacheChannels,
  DashboardChannels,
  GoalChannels,
  ReminderChannels,
  TaskChannels,
} from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { isDesktopDevelopmentRuntime } from './dev-runtime';

// ============ Types ============

/**
 * @interface CacheEntry
 * @description Represents a single entry in the cache.
 *
 * @template T The type of the cached data.
 */
interface CacheEntry<T> {
  /** The cached data. */
  data: T;
  /** The timestamp when the entry was created. */
  timestamp: number;
  /** Number of times this entry has been accessed. */
  accessCount: number;
}

/**
 * @interface CacheOptions
 * @description Configuration options for the IPC Cache.
 */
interface CacheOptions {
  /** Maximum number of entries to hold in the cache. */
  maxSize?: number;
  /** Default Time-To-Live (TTL) for cache entries in milliseconds. */
  defaultTTL?: number;
  /** Whether to enable debug logging. Defaults to true in development. */
  debug?: boolean;
}

/**
 * @interface CacheStats
 * @description Statistics about the cache usage.
 */
interface CacheStats {
  /** Current number of entries in the cache. */
  size: number;
  /** Total number of cache hits. */
  hits: number;
  /** Total number of cache misses. */
  misses: number;
  /** Cache hit rate (0.0 to 1.0). */
  hitRate: number;
}

// ============ LRU Cache Implementation ============

/**
 * @class LRUCache
 * @description A generic Least Recently Used (LRU) Cache implementation.
 *
 * @template K The type of the cache key.
 * @template V The type of the cache value.
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  /**
   * @constructor
   * @description Creates an instance of LRUCache.
   *
   * @param {number} maxSize - The maximum number of entries allowed in the cache.
   */
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * @method get
   * @description Retrieves a value from the cache.
   * Marks the retrieved item as the most recently used.
   *
   * @param {K} key - The key to retrieve.
   * @returns {V | undefined} The value if found, otherwise undefined.
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * @method set
   * @description Adds or updates a value in the cache.
   * If the cache is full, the least recently used item is removed.
   *
   * @param {K} key - The key to set.
   * @param {V} value - The value to store.
   */
  set(key: K, value: V): void {
    // If key exists, delete old entry to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If capacity reached, remove the oldest entry
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * @method has
   * @description Checks if a key exists in the cache.
   *
   * @param {K} key - The key to check.
   * @returns {boolean} True if the key exists, false otherwise.
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * @method delete
   * @description Removes a specific key from the cache.
   *
   * @param {K} key - The key to remove.
   * @returns {boolean} True if an element existed and has been removed, false otherwise.
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * @method clear
   * @description Clears all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * @getter size
   * @description Gets the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * @method keys
   * @description Returns an iterator over the keys in the cache.
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
}

// ============ IPC Cache Class ============

/**
 * @class IpcCache
 * @description Manages caching for IPC requests using an LRU cache.
 * Supports Time-To-Live (TTL) expiration per channel.
 */
export class IpcCache {
  private cache: LRUCache<string, CacheEntry<unknown>>;
  private channelTTL: Map<string, number> = new Map();
  private stats = { hits: 0, misses: 0 };
  private readonly defaultTTL: number;
  private readonly debug: boolean;

  /**
   * @constructor
   * @description Creates an instance of IpcCache.
   *
   * @param {CacheOptions} [options={}] - Configuration options.
   */
  constructor(options: CacheOptions = {}) {
    const {
      maxSize = 100,
      defaultTTL = 5000,
      debug = isDesktopDevelopmentRuntime(),
    } = options;

    this.cache = new LRUCache(maxSize);
    this.defaultTTL = defaultTTL;
    this.debug = debug;
  }

  /**
   * @method setChannelTTL
   * @description Sets a specific TTL for a given IPC channel.
   *
   * @param {string} channel - The IPC channel name.
   * @param {number} ttl - The Time-To-Live in milliseconds.
   */
  setChannelTTL(channel: string, ttl: number): void {
    this.channelTTL.set(channel, ttl);
  }

  /**
   * @method generateKey
   * @description Generates a unique cache key based on the channel and arguments.
   *
   * @param {string} channel - The IPC channel name.
   * @param {unknown[]} args - The arguments passed to the IPC handler.
   * @returns {string} The generated cache key.
   */
  private generateKey(channel: string, args: unknown[]): string {
    const argsHash = JSON.stringify(args);
    return `${channel}:${argsHash}`;
  }

  /**
   * @method get
   * @description Retrieves a cached value for a specific channel and arguments.
   * Checks for expiration based on TTL.
   *
   * @template T The expected return type.
   * @param {string} channel - The IPC channel name.
   * @param {unknown[]} args - The arguments passed to the IPC handler.
   * @returns {T | undefined} The cached value if found and valid, otherwise undefined.
   */
  get<T>(channel: string, args: unknown[]): T | undefined {
    const key = this.generateKey(channel, args);
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    const ttl = this.channelTTL.get(channel) ?? this.defaultTTL;
    const isExpired = Date.now() - entry.timestamp > ttl;

    if (isExpired) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    entry.accessCount++;
    this.stats.hits++;

    if (this.debug) {
      console.log(`[IpcCache] HIT: ${channel} (${entry.accessCount} times)`);
    }

    return entry.data;
  }

  /**
   * @method set
   * @description Stores a value in the cache.
   *
   * @template T The type of the value.
   * @param {string} channel - The IPC channel name.
   * @param {unknown[]} args - The arguments passed to the IPC handler.
   * @param {T} data - The data to cache.
   */
  set<T>(channel: string, args: unknown[], data: T): void {
    const key = this.generateKey(channel, args);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1,
    });

    if (this.debug) {
      console.log(`[IpcCache] SET: ${channel}`);
    }
  }

  /**
   * @method invalidateChannel
   * @description Invalidates all cache entries for a specific channel.
   *
   * @param {string} channel - The IPC channel name to invalidate.
   * @returns {number} The number of invalidated entries.
   */
  invalidateChannel(channel: string): number {
    let count = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${channel}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      count++;
    }

    if (this.debug && count > 0) {
      console.log(`[IpcCache] Invalidated ${count} entries for channel: ${channel}`);
    }

    return count;
  }

  /**
   * @method invalidatePattern
   * @description Invalidates cache entries matching a specific regex pattern.
   *
   * @param {RegExp} pattern - The regex pattern to match keys against.
   * @returns {number} The number of invalidated entries.
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      count++;
    }

    return count;
  }

  /**
   * @method clear
   * @description Clears the entire cache and resets statistics.
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };

    if (this.debug) {
      console.log('[IpcCache] Cleared all cache');
    }
  }

  /**
   * @method getStats
   * @description Retrieves current cache statistics.
   *
   * @returns {CacheStats} The statistics object.
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }
}

// ============ Singleton Instance ============

let ipcCacheInstance: IpcCache | null = null;

/**
 * @function getIpcCache
 * @description Retrieves the singleton instance of IpcCache.
 *
 * @returns {IpcCache} The IPC cache instance.
 */
export function getIpcCache(): IpcCache {
  if (!ipcCacheInstance) {
    ipcCacheInstance = new IpcCache({
      maxSize: 100,
      defaultTTL: 5000, // 5 seconds default TTL
    });

    // Configure specific channel TTLs
    ipcCacheInstance.setChannelTTL(GoalChannels.LIST, 10000); // 10 seconds
    ipcCacheInstance.setChannelTTL(TaskChannels.PLAN_LIST, 10000);
    ipcCacheInstance.setChannelTTL(DashboardChannels.GET_STATS, 30000); // 30 seconds
    ipcCacheInstance.setChannelTTL(ReminderChannels.TEMPLATE_LIST, 5000); // 5 seconds
  }
  return ipcCacheInstance;
}

// ============ Cache Wrapper for IPC Handlers ============

/**
 * @function withCache
 * @description Higher-order function to wrap an IPC handler with caching logic.
 *
 * @example
 * ```typescript
 * ipcMain.handle('goal:list', withCache(
 *   async (event, params) => {
 *     return await goalService.list(params);
 *   },
 *   { ttl: 10000 }
 * ));
 * ```
 *
 * @template T The return type of the handler.
 * @param {(event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>} handler - The original IPC handler.
 * @param {Object} [options] - Caching options.
 * @param {number} [options.ttl] - Custom TTL for this specific handler.
 * @param {string} [options.channel] - Channel name for logging and key generation (defaults to 'unknown').
 * @returns {(event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>} The wrapped handler.
 */
export function withCache<T>(
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>,
  options?: { ttl?: number; channel?: string },
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> {
  return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const cache = getIpcCache();
    const channel = options?.channel ?? 'unknown';

    // Try to get from cache
    const cached = cache.get<T>(channel, args);
    if (cached !== undefined) {
      return cached;
    }

    // Execute actual handler
    const result = await handler(event, ...args);

    // Store in cache
    cache.set(channel, args, result);

    return result;
  };
}

/**
 * @function invalidatesCache
 * @description Higher-order function to wrap an IPC handler such that it invalidates cache entries upon success.
 * Useful for mutation operations (create, update, delete).
 *
 * @example
 * ```typescript
 * ipcMain.handle('goal:create', invalidatesCache(
 *   async (event, request) => {
 *     return await goalService.create(request);
 *   },
 *   ['goal:list', 'dashboard:get-all']
 * ));
 * ```
 *
 * @template T The return type of the handler.
 * @param {(event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>} handler - The original IPC handler.
 * @param {string[]} channelsToInvalidate - List of channel names to invalidate.
 * @returns {(event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>} The wrapped handler.
 */
export function invalidatesCache<T>(
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>,
  channelsToInvalidate: string[],
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> {
  return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const result = await handler(event, ...args);

    // After successful write operation, invalidate related caches
    const cache = getIpcCache();
    for (const channel of channelsToInvalidate) {
      cache.invalidateChannel(channel);
    }

    return result;
  };
}

// ============ IPC Handlers for Cache Management ============

/**
 * @function registerCacheIpcHandlers
 * @description Registers IPC handlers for managing the cache (stats, clear, invalidate).
 */
export function registerCacheIpcHandlers(): void {
  ipcMain.handle(CacheChannels.STATS, async () => {
    return ok(getIpcCache().getStats());
  });

  ipcMain.handle(CacheChannels.CLEAR, async () => {
    getIpcCache().clear();
    return ok(null);
  });

  ipcMain.handle(CacheChannels.INVALIDATE, async (_, channel: string) => {
    const count = getIpcCache().invalidateChannel(channel);
    return ok({ invalidated: count });
  });

  console.log('[IpcCache] Management IPC handlers registered');
}
