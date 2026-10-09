// Research fixture, not a production benchmark or a replacement test target.
// Run from the repository root:
// node --expose-gc --import tsx docs/analysis/evidence/2026-10-09-desktop-performance/local-vault-experiment.mjs [new-output.json]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setImmediate } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import matter from 'gray-matter';
import { LocalVaultRuntime } from '../../../../packages/repository/src/electron/local-vault-runtime.ts';

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-vault-research-'));
const bytesPerNote = 4096;
const output = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  methodology: {
    source: 'packages/repository/src/electron/local-vault-runtime.ts (direct source import via tsx)',
    bytesPerNote,
    searchQuery: 'needlealpha',
    samples: 5,
    filesystem: 'Fresh synthetic files, OS cache not evicted; repeated queries are warm.',
    counts: 'A separate instrumented query counts fs.promises calls; timed samples are uninstrumented.',
    scope: 'Node/Linux source-level experiment; excludes Electron, renderer, IPC, GPU and Windows.',
  },
  search: [],
};

function documentId(index) {
  return `kdoc_00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function markdown(index, size = bytesPerNote, revision = 0) {
  const head = `---\ntitle: Research note ${index}\ntags: [synthetic]\nmemoflow_id: ${documentId(index)}\n---\n# Note ${index}\nRevision ${revision}. MemoFlow Electron ${index % 100 === 0 ? 'needlealpha' : 'neutralword'}.\n`;
  return head + 'x'.repeat(size - Buffer.byteLength(head));
}

function makeRuntime(name, selectDirectory) {
  return new LocalVaultRuntime({
    localProfileId: 'research-profile',
    bindingFilePath: path.join(root, name, 'profile', 'binding.json'),
    writeLedgerFilePath: path.join(root, name, 'profile', 'ledger.json'),
    platform: { selectDirectory, openExternal: async () => undefined },
  });
}

async function fixture(count) {
  const name = `size-${count}`;
  const vault = path.join(root, name, 'vault');
  for (let i = 0; i < Math.ceil(count / 200); i++) {
    await fs.promises.mkdir(path.join(vault, `group-${String(i).padStart(4, '0')}`), { recursive: true });
  }
  for (let batch = 0; batch < count; batch += 32) {
    await Promise.all(Array.from({ length: Math.min(32, count - batch) }, (_, offset) => {
      const i = batch + offset;
      return fs.promises.writeFile(
        path.join(vault, `group-${String(Math.floor(i / 200)).padStart(4, '0')}`, `note-${String(i).padStart(5, '0')}.md`),
        markdown(i),
      );
    }));
  }
  const runtime = makeRuntime(name, async () => vault);
  await runtime.selectVault();
  return { runtime, vault };
}

async function query(runtime) {
  const start = performance.now();
  const result = await runtime.searchVault({ query: 'needlealpha', limit: 100 });
  return { elapsedMs: performance.now() - start, resultCount: result.results.length };
}

async function countIo(runtime) {
  const counters = { markdownReads: 0, bindingReads: 0, markdownBytes: 0 };
  const originals = {};
  for (const name of ['readFile', 'stat', 'realpath', 'access', 'readdir']) {
    originals[name] = fs.promises[name];
    counters[name] = 0;
    fs.promises[name] = async (...args) => {
      counters[name]++;
      const result = await originals[name].apply(fs.promises, args);
      if (name === 'readFile') {
        if (String(args[0]).endsWith('.md')) {
          counters.markdownReads++;
          counters.markdownBytes += Buffer.byteLength(result);
        } else if (String(args[0]).endsWith('binding.json')) counters.bindingReads++;
      }
      return result;
    };
  }
  try {
    await query(runtime);
  } finally {
    for (const [name, original] of Object.entries(originals)) fs.promises[name] = original;
  }
  return counters;
}

async function memorySnapshot(label) {
  await setImmediate();
  global.gc?.();
  global.gc?.();
  const usage = process.memoryUsage();
  return { label, cacheEntries: Object.keys(matter.cache).length, ...usage };
}

try {
  let largest;
  for (const count of [100, 1000, 10000]) {
    console.error(`Research: ${count} synthetic notes`);
    matter.clearCache();
    const current = await fixture(count);
    const first = await query(current.runtime);
    const samples = [];
    for (let i = 0; i < 5; i++) samples.push((await query(current.runtime)).elapsedMs);
    const sorted = [...samples].sort((a, b) => a - b);
    const io = await countIo(current.runtime);
    assert.equal(io.markdownReads, 2 * count);
    assert.equal(io.bindingReads, count + 1);
    output.search.push({
      notes: count,
      firstQueryMs: first.elapsedMs,
      resultCount: first.resultCount,
      repeatedQueryMs: samples,
      medianMs: sorted[2],
      minMs: sorted[0],
      maxMs: sorted[4],
      io,
      parserCacheEntries: Object.keys(matter.cache).length,
    });
    largest = current;
  }

  // Exercise the real scan boundary and duplicate-identity check using only fixtures.
  const sentinelId = documentId(999999999999);
  await fs.promises.writeFile(path.join(largest.vault, 'zzzz-sentinel.md'), `---\nmemoflow_id: ${sentinelId}\n---\n# Unique sentinel\nonlybeyondscanlimit`);
  const scan = await largest.runtime.scanVault();
  const sentinelSearch = await largest.runtime.searchVault({ query: 'onlybeyondscanlimit' });
  let duplicateWrite;
  try {
    duplicateWrite = await largest.runtime.writeConfirmedNote({
      requestId: 'research-request',
      proposalId: 'research-proposal',
      proposalRevision: 1,
      knowledgeDocumentId: sentinelId,
      relativePath: 'zzzz-duplicate.md',
      contentMarkdown: '# Duplicate identity fixture',
    });
  } catch (error) {
    duplicateWrite = { error: error.code ?? error.name };
  }
  output.scanLimit = {
    inputNotes: 10001,
    returnedNotes: scan.notes.length,
    responseKeys: Object.keys(scan),
    sentinelPresentInScan: scan.notes.some(note => note.relativePath === 'zzzz-sentinel.md'),
    sentinelSearchResults: sentinelSearch.results.length,
    duplicateIdentityWriteCreated: duplicateWrite.created === true,
    duplicateWriteError: duplicateWrite.error ?? null,
  };

  // A controlled binding switch between scan and per-note read reproduces the race.
  const vaultA = path.join(root, 'race', 'a');
  const vaultB = path.join(root, 'race', 'b');
  await fs.promises.mkdir(vaultA, { recursive: true });
  await fs.promises.mkdir(vaultB, { recursive: true });
  await fs.promises.writeFile(path.join(vaultA, 'same.md'), '# Title from A\ncontent-a');
  await fs.promises.writeFile(path.join(vaultB, 'same.md'), '# Title from B\nfrom-vault-b-only');
  let selected = vaultA;
  const racing = makeRuntime('race', async () => selected);
  await racing.selectVault();
  const originalRead = racing.readNote.bind(racing);
  racing.readNote = async request => {
    selected = vaultB;
    await racing.selectVault();
    return originalRead(request);
  };
  const raceResult = await racing.searchVault({ query: 'from-vault-b-only' });
  output.bindingRace = {
    resultCount: raceResult.results.length,
    summaryTitle: raceResult.results[0]?.note.title ?? null,
    matchedLine: raceResult.results[0]?.matches[0]?.lineContent ?? null,
    injection: 'Select Vault B immediately before public readNote; scan summaries came from Vault A.',
  };

  // Release benchmark parser entries, then read 200 revisions of ONE 64 KiB note.
  matter.clearCache();
  const cacheVault = path.join(root, 'cache', 'vault');
  await fs.promises.mkdir(cacheVault, { recursive: true });
  const caching = makeRuntime('cache', async () => cacheVault);
  await caching.selectVault();
  const snapshots = [await memorySnapshot('before')];
  for (let version = 1; version <= 200; version++) {
    await fs.promises.writeFile(path.join(cacheVault, 'edited.md'), markdown(1, 65536, version));
    await caching.readNote({ relativePath: 'edited.md' });
    if (version % 50 === 0) snapshots.push(await memorySnapshot(`after-${version}-versions`));
  }
  await caching.detachVault();
  snapshots.push(await memorySnapshot('after-detach'));
  matter.clearCache();
  snapshots.push(await memorySnapshot('after-explicit-test-only-clear'));
  // API-level control: passing options bypasses gray-matter's default global cache.
  for (let version = 1; version <= 200; version++) matter(markdown(1, 65536, version), {});
  snapshots.push(await memorySnapshot('explicit-options-control'));
  output.parserCache = { uniqueFiles: 1, versions: 200, bytesPerVersion: 65536, gcExposed: !!global.gc, snapshots };

  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (process.argv[2]) await fs.promises.writeFile(process.argv[2], serialized, { flag: 'wx' });
  else process.stdout.write(serialized);
} finally {
  matter.clearCache();
  await fs.promises.rm(root, { recursive: true, force: true });
}
