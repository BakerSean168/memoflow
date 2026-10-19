/** Allocate a conversation's persisted logical clock only on first insert. */
export function nextHistoryTimestamp(createdAt: number, latest: number | null): number {
  return Math.max(createdAt, (latest ?? -1) + 1);
}

/** Stable timestamp ordering preserves the store's recalled order for legacy ties. */
export function compareHistoryTimestamps(left: number, right: number): number {
  return left - right;
}
