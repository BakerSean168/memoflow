// A query-cache refresh at an existing owner deadline, not a business scheduler.
export function nextAttentionRefresh(at: number | null | undefined): number | false {
  if (at == null) return false;
  const remaining = at - Date.now();
  // Retained stale data after a failed fetch must not create a tight retry loop.
  return remaining <= 0 ? 5_000 : Math.min(2_147_483_647, remaining + 25);
}
