import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Decimal bytes; leave 1 GB below the 8 GB acceptance threshold for unmanaged caches.
export const cacheBudgets = Object.freeze({
  'docker/buildx': 1_000_000_000,
  pnpm: 2_000_000_000,
  nx: 3_000_000_000,
  playwright: 750_000_000,
  uv: 250_000_000,
});

export function cacheFamily(key) {
  if (key.startsWith('nx-')) return 'nx';
  if (key.startsWith('pnpm-store-')) return 'pnpm';
  if (key.startsWith('playwright-')) return 'playwright';
  if (key.startsWith('setup-uv-')) return 'uv';
  if (key.startsWith('index-') || key.startsWith('buildkit') || key.includes('-blob-')) {
    return 'docker/buildx';
  }
  return undefined;
}

export function planCacheCleanup(caches, closedPullRequests) {
  const deletions = [];
  for (const cache of caches) {
    const match = /^refs\/pull\/(\d+)\/merge$/u.exec(cache.ref);
    if (match && closedPullRequests.has(Number(match[1]))) deletions.push(cache);
  }
  for (const [family, budget] of Object.entries(cacheBudgets)) {
    const entries = caches
      .filter((cache) => cache.ref === 'refs/heads/main' && cacheFamily(cache.key) === family)
      .sort((a, b) => a.last_accessed_at.localeCompare(b.last_accessed_at) || a.id - b.id);
    let bytes = entries.reduce((sum, cache) => sum + cache.size_in_bytes, 0);
    for (const cache of entries) {
      if (bytes <= budget) break;
      deletions.push(cache);
      bytes -= cache.size_in_bytes;
    }
  }
  return deletions;
}

export function cleanupActionsCache({
  repository = process.env.GITHUB_REPOSITORY,
  gh = (args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    }),
} = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? '')) throw new Error('Invalid repository');
  const pages = (endpoint) => JSON.parse(gh(['api', '--paginate', '--slurp', endpoint]));
  const caches = pages(`repos/${repository}/actions/caches?per_page=100`).flatMap((page) => {
    if (!Array.isArray(page.actions_caches)) throw new Error('Invalid cache page');
    return page.actions_caches;
  });
  for (const cache of caches) {
    if (
      !Number.isSafeInteger(cache.id) ||
      cache.id <= 0 ||
      typeof cache.ref !== 'string' ||
      typeof cache.key !== 'string' ||
      !Number.isSafeInteger(cache.size_in_bytes) ||
      cache.size_in_bytes < 0 ||
      typeof cache.last_accessed_at !== 'string' ||
      !Number.isFinite(Date.parse(cache.last_accessed_at))
    ) {
      throw new Error('Invalid cache entry');
    }
  }
  // Fetch each cached PR once. Do not infer closed state from missing branches or age.
  const numbers = new Set(
    caches.flatMap((cache) => {
      const match = /^refs\/pull\/(\d+)\/merge$/u.exec(cache.ref);
      return match ? [Number(match[1])] : [];
    }),
  );
  const closed = new Set();
  for (const number of numbers) {
    const pr = JSON.parse(gh(['api', `repos/${repository}/pulls/${number}`]));
    if (pr.number !== number || !['open', 'closed'].includes(pr.state)) {
      throw new Error('Invalid pull request state');
    }
    if (pr.state === 'closed') closed.add(number);
  }
  const plan = planCacheCleanup(caches, closed);
  console.log(
    JSON.stringify({
      beforeBytes: caches.reduce((n, c) => n + c.size_in_bytes, 0),
      deletions: plan.map((c) => ({ id: c.id, ref: c.ref, key: c.key, bytes: c.size_in_bytes })),
    }),
  );
  for (const cache of plan) {
    gh(['api', '--method', 'DELETE', `repos/${repository}/actions/caches/${cache.id}`]);
  }
  console.log(gh(['api', `repos/${repository}/actions/cache/usage`]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanupActionsCache();
}
