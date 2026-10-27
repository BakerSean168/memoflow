export function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('category' in error && (error as { category?: unknown }).category === 'aborted') return true;
  return 'name' in error && (error as { name?: unknown }).name === 'AbortError';
}
