// Cache patterns - LRU and TTL cache implementations
// To be populated with LRUCache and TTLCache

/**
 * Cache interface
 */
export interface ICache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  clear(): void;
  has(key: K): boolean;
  size: number;
}

/**
 * TTL Cache options
 */
export interface TTLCacheOptions {
  ttl?: number; // time to live in milliseconds
  maxSize?: number; // maximum number of items
}
