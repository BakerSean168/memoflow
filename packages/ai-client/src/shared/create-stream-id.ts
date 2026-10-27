/**
 * Residual 993: sole createStreamId helper for AI IPC stream adapters.
 * Assistant + message IPC adapters import this; local duals retired.
 * Prefer globalThis.crypto.randomUUID; fallback uses stream-<ts>-<rand>.
 */

export function createStreamId(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
