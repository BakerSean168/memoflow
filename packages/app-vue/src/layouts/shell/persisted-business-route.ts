/**
 * Remove route-owned transient UI state before a BusinessTab is restored from
 * durable shell state. Dialog query parameters are useful for live deep links
 * and browser history, but restoring them after a fresh app/auth session would
 * resurrect stale overlays.
 */
export function canonicalizePersistedBusinessRoute(route: string): string {
  const hashIndex = route.indexOf('#');
  const hash = hashIndex >= 0 ? route.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? route.slice(0, hashIndex) : route;
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex < 0) return route;

  const path = withoutHash.slice(0, queryIndex);
  const search = new URLSearchParams(withoutHash.slice(queryIndex + 1));
  const dialog = search.get('dialog');
  if (!dialog) return route;

  search.delete('dialog');

  // Goal edit/create identity belongs to the dialog rather than the list surface.
  if (path === '/goals' && dialog === 'goal') {
    search.delete('goalId');
  }

  const query = search.toString();
  return `${path}${query ? `?${query}` : ''}${hash}`;
}
