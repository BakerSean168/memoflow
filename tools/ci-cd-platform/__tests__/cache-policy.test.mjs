import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  cacheBudgets,
  cacheFamily,
  cleanupActionsCache,
  planCacheCleanup,
} from '../cleanup-actions-cache.mjs';

const read = (file) => readFile(new URL(`../../../${file}`, import.meta.url), 'utf8');

test('every Unit shard provides history required when LPT moves the live Git selector test', async () => {
  const workflow = await read('.github/workflows/ci.yml');
  for (const job of ['unit-1', 'unit-2', 'unit-3']) {
    const section = workflow.match(new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  \\S)`, 'mu'))?.[1];
    assert.ok(section, job);
    assert.match(section, /with: \{ fetch-depth: 0 \}/u, job);
  }
});

test('cache writes are main-only post-job saves and every other ref is restore-only', async () => {
  const action = await read('.github/actions/restore-main-cache/action.yml');
  const [main, restore] = action.split('    - id: read');
  assert.match(main, /github.ref == 'refs\/heads\/main'/u);
  for (const event of ['pull_request', 'pull_request_target']) {
    assert.ok(main.includes(`github.event_name != '${event}'`));
    assert.ok(restore.includes(`github.event_name == '${event}'`));
  }
  assert.match(main, /uses: actions\/cache@[a-f0-9]{40}/u);
  assert.match(restore, /github.ref != 'refs\/heads\/main'/u);
  assert.match(restore, /uses: actions\/cache\/restore@[a-f0-9]{40}/u);
  assert.doesNotMatch(restore, /uses: actions\/cache(?:\/save)?@/u);
  for (const section of [main, restore]) {
    for (const input of ['path', 'key', 'restore-keys']) {
      assert.ok(section.includes(`${input}: \${{ inputs.${input} }}`));
    }
  }
});

test('workspace cache keys bind lockfile and architecture; only Nx binds job, matrix variant and SHA', async () => {
  const action = await read('.github/actions/setup-nx-affected-job/action.yml');
  assert.equal((action.match(/uses: \.\/\.github\/actions\/restore-main-cache/gu) ?? []).length, 3);
  const keys = action.split('\n').filter((line) => line.trim().startsWith('key:'));
  assert.equal(keys.length, 3);
  for (const key of keys) {
    for (const part of ['pnpm-lock.yaml', 'runner.os', 'runner.arch']) {
      assert.ok(key.includes(part), key);
    }
  }
  const nx = keys.find((line) => line.includes('key: nx-'));
  assert.ok(nx.includes('github.job') && nx.includes('github.sha'));
  assert.ok(nx.includes('inputs.cache-variant'), nx);
  // pnpm store and browser binaries are identical across shards: one shared entry, no per-shard copies.
  for (const shared of keys.filter((line) => !line.includes('key: nx-'))) {
    assert.ok(!shared.includes('inputs.cache-variant'), shared);
  }
  const nxFallback = action.split('restore-keys: |')[1].split('\n')[1];
  assert.ok(nx.startsWith(nxFallback.replace(/^\s+/u, '        key: ')));
  assert.doesNotMatch(action, /restore-keys: pnpm-store-/u);
  assert.match(
    action,
    /enable-cache:.*github.ref == 'refs\/heads\/main'.*github.event_name != 'pull_request'.*github.event_name != 'pull_request_target'/u,
  );
  const ci = await read('.github/workflows/ci.yml');
  assert.match(
    ci.slice(ci.indexOf('  web-specialized:')),
    /cache-variant: web-\$\{\{ strategy.job-index \}\}/u,
  );
});

test('Docker GHA exports use explicit component scope, min mode and main-only authority', async () => {
  const workflow = await read('.github/workflows/candidate-publish.yml');
  assert.match(workflow, /cache-from: type=gha,scope=\$\{\{ matrix.cache_scope \}\}/u);
  assert.match(
    workflow,
    /cache-to:.*github.ref == 'refs\/heads\/main'.*github.event_name != 'pull_request'.*github.event_name != 'pull_request_target'.*type=gha,mode=min,scope=/u,
  );
  assert.doesNotMatch(workflow, /type=gha,mode=max/u);
  for (const component of ['api', 'migrator', 'web'])
    assert.ok(workflow.includes(`cache_scope: candidate-${component}`));
});

test('cleanup is opt-in, serialized, least-privilege and never checks out PR code', async () => {
  const workflow = await read('.github/workflows/cache-cleanup.yml');
  assert.match(workflow, /pull_request_target:\n\s+types: \[closed\]/u);
  assert.match(workflow, /schedule:/u);
  assert.match(workflow, /if: vars.ACTIONS_CACHE_CLEANUP_ENABLED == 'true'/u);
  assert.match(workflow, /permissions: \{\}/u);
  assert.equal((workflow.match(/actions: write/gu) ?? []).length, 1);
  assert.match(workflow, /pull-requests: read/u);
  assert.match(workflow, /ref: main\n\s+persist-credentials: false/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.doesNotMatch(
    workflow,
    /workflow_dispatch|pull_request\.head|packages: write|contents: write/u,
  );
});

test('cleanup removes closed merge refs only and prunes main LRU within each budget', () => {
  const cache = (id, ref, key, size, date = '2026-10-19T00:00:00Z') => ({
    id,
    ref,
    key,
    size_in_bytes: size,
    last_accessed_at: date,
  });
  const caches = [
    cache(1, 'refs/pull/1/merge', 'nx-one', 100),
    cache(2, 'refs/pull/2/merge', 'nx-two', 100),
    cache(3, 'refs/heads/feature', 'nx-three', 100),
    cache(4, 'refs/heads/main', 'nx-new', 2e9),
    cache(5, 'refs/heads/main', 'nx-old', 2e9, '2026-10-18T00:00:00Z'),
    cache(6, 'refs/heads/main', 'pnpm-store-new', 1e9),
    cache(7, 'refs/heads/main', 'unmanaged', 9e9),
    cache(8, 'refs/pull/1/head', 'nx-head', 100),
  ];
  assert.deepEqual(
    planCacheCleanup(caches, new Set([1])).map((c) => c.id),
    [1, 5],
  );
  assert.deepEqual(planCacheCleanup([caches[3]], new Set()), []);
  assert.equal(
    Object.values(cacheBudgets).reduce((a, b) => a + b, 0),
    7e9,
  );
  assert.equal(cacheFamily('index-candidate-api'), 'docker/buildx');
  assert.equal(cacheFamily('buildkit-blob-abc'), 'docker/buildx');
  assert.equal(cacheFamily('setup-uv-1'), 'uv');
  assert.equal(cacheFamily('unmanaged'), undefined);
});

test('cleanup paginates, confirms PR state and deletes only planned numeric IDs', () => {
  const calls = [];
  const entry = (id, ref) => ({
    id,
    ref,
    key: 'nx-test',
    size_in_bytes: 100,
    last_accessed_at: '2026-10-19T00:00:00Z',
  });
  const gh = (args) => {
    calls.push(args);
    const endpoint = args.at(-1);
    if (endpoint.endsWith('per_page=100'))
      return JSON.stringify([
        { actions_caches: [entry(1, 'refs/pull/1/merge')] },
        { actions_caches: [entry(2, 'refs/pull/2/merge')] },
      ]);
    if (endpoint.endsWith('/pulls/1')) return JSON.stringify({ number: 1, state: 'closed' });
    if (endpoint.endsWith('/pulls/2')) return JSON.stringify({ number: 2, state: 'open' });
    return '{}';
  };
  cleanupActionsCache({ repository: 'owner/repo', gh });
  assert.deepEqual(calls[0], [
    'api',
    '--paginate',
    '--slurp',
    'repos/owner/repo/actions/caches?per_page=100',
  ]);
  assert.deepEqual(
    calls.filter((args) => args.includes('DELETE')),
    [['api', '--method', 'DELETE', 'repos/owner/repo/actions/caches/1']],
  );
  assert.deepEqual(calls.at(-1), ['api', 'repos/owner/repo/actions/cache/usage']);
});

test('cleanup fails before deletion for invalid API input or unavailable PR state', () => {
  let deleted = false;
  for (const invalid of [true, false]) {
    const gh = (args) => {
      if (args.includes('DELETE')) deleted = true;
      if (args.at(-1).endsWith('per_page=100'))
        return JSON.stringify([
          {
            actions_caches: [
              {
                id: invalid ? 'unsafe' : 1,
                ref: 'refs/pull/1/merge',
                key: 'nx-one',
                size_in_bytes: 100,
                last_accessed_at: '2026-10-19T00:00:00Z',
              },
            ],
          },
        ]);
      throw new Error('PR state unavailable');
    };
    assert.throws(
      () => cleanupActionsCache({ repository: 'owner/repo', gh }),
      /Invalid cache entry|PR state unavailable/u,
    );
  }
  assert.equal(deleted, false);
});

test('workflows cannot bypass the shared Actions cache write boundary', async () => {
  const files = await readdir(new URL('../../../.github/', import.meta.url), { recursive: true });
  for (const file of files.filter((file) => /\.ya?ml$/u.test(file))) {
    const source = await read(`.github/${file}`);
    if (/uses: actions\/cache(?:\/save)?@/u.test(source)) {
      assert.equal(file, 'actions/restore-main-cache/action.yml', file);
    }
    for (const line of source
      .split('\n')
      .filter((line) => line.includes('cache-to:') && line.includes('type=gha'))) {
      assert.ok(
        line.includes("github.ref == 'refs/heads/main'") && line.includes('mode=min,scope='),
        `${file}: ${line}`,
      );
    }
  }
});
