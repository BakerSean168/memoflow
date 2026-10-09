// Post-change source experiment. Original baseline probes/results are preserved.
// node --expose-gc --import tsx docs/analysis/evidence/2026-10-09-desktop-performance/local-vault-after.mjs [new-output.json]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setImmediate } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import matter from 'gray-matter';
import { LocalVaultRuntime } from '../../../../packages/repository/src/electron/local-vault-runtime.ts';

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-vault-after-'));
const runtimes = [];
const bytesPerNote = 4096;
const source = await fs.promises.readFile(new URL('../../../../packages/repository/src/electron/local-vault-runtime.ts', import.meta.url));
const output = {
  recordedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  environment: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, loadAverage: os.loadavg() },
  methodology: { bytesPerNote, samples: 5, query: 'needlealpha', filesystem: 'Same synthetic fixture shape as baseline; OS cache not evicted.', counts: 'Separate fs.promises instrumentation; timed samples are uninstrumented.', scope: 'Node/Linux source-level experiment, not Electron/IPC/renderer or Windows.', cacheBudget: '128 MiB accounted serialized payload; not a hard RSS bound.' },
  search: [],
};

function documentId(index) { return `kdoc_00000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
function markdown(index, size = bytesPerNote, revision = 0) {
  const head = `---\ntitle: Research note ${index}\ntags: [synthetic]\nmemoflow_id: ${documentId(index)}\n---\n# Note ${index}\nRevision ${revision}. MemoFlow Electron ${index % 100 === 0 ? 'needlealpha' : 'neutralword'}.\n`;
  return head + 'x'.repeat(size - Buffer.byteLength(head));
}
function makeRuntime(name, selectDirectory) {
  const runtime = new LocalVaultRuntime({
    localProfileId: 'research-profile',
    bindingFilePath: path.join(root, name, 'profile', 'binding.json'),
    writeLedgerFilePath: path.join(root, name, 'profile', 'ledger.json'),
    platform: { selectDirectory, openExternal: async () => undefined },
  });
  runtimes.push(runtime);
  return runtime;
}
async function fixture(count) {
  const name = `size-${count}`;
  const vault = path.join(root, name, 'vault');
  for (let i = 0; i < Math.ceil(count / 200); i++) await fs.promises.mkdir(path.join(vault, `group-${String(i).padStart(4, '0')}`), { recursive: true });
  for (let batch = 0; batch < count; batch += 32) {
    await Promise.all(Array.from({ length: Math.min(32, count - batch) }, (_, offset) => {
      const i = batch + offset;
      return fs.promises.writeFile(path.join(vault, `group-${String(Math.floor(i / 200)).padStart(4, '0')}`, `note-${String(i).padStart(5, '0')}.md`), markdown(i));
    }));
  }
  const runtime = makeRuntime(name, async () => vault);
  await runtime.selectVault();
  return { name, runtime, vault };
}
async function query(runtime) {
  const started = performance.now();
  const result = await runtime.searchVault({ query: 'needlealpha', limit: 100 });
  return { elapsedMs: performance.now() - started, resultCount: result.results.length };
}
async function countIo(operation) {
  const counters = { markdownReads: 0, bindingReads: 0, markdownBytes: 0 };
  const originals = {};
  for (const name of ['readFile', 'stat', 'realpath', 'access', 'readdir']) {
    const original = fs.promises[name];
    originals[name] = original;
    counters[name] = 0;
    fs.promises[name] = async (...args) => {
      counters[name]++;
      const result = await original.apply(fs.promises, args);
      if (name === 'readFile') {
        if (String(args[0]).endsWith('.md')) { counters.markdownReads++; counters.markdownBytes += Buffer.byteLength(result); }
        else if (String(args[0]).endsWith('binding.json')) counters.bindingReads++;
      }
      return result;
    };
  }
  try { await operation(); } finally {
    for (const [name, original] of Object.entries(originals)) fs.promises[name] = original;
  }
  return counters;
}
async function memorySnapshot(label) {
  await setImmediate();
  global.gc?.();
  global.gc?.();
  return { label, parserCacheEntries: Object.keys(matter.cache).length, ...process.memoryUsage() };
}

try {
  let largest;
  for (const count of [100, 1000, 10000]) {
    console.error(`Post-change fixture: ${count} notes`);
    matter.clearCache();
    const current = await fixture(count);
    const first = await query(current.runtime);
    const samples = [];
    for (let i = 0; i < 5; i++) samples.push((await query(current.runtime)).elapsedMs);
    const warmIo = await countIo(() => query(current.runtime));
    assert.equal(warmIo.markdownReads, 0);
    assert.equal(warmIo.bindingReads, 1);
    const coldRuntime = makeRuntime(current.name, async () => current.vault);
    const coldIo = await countIo(() => query(coldRuntime));
    assert.equal(coldIo.markdownReads, count);
    await coldRuntime.dispose();
    const changedPath = path.join(current.vault, 'group-0000', 'note-00000.md');
    await fs.promises.writeFile(changedPath, markdown(0, bytesPerNote, 1));
    const changedIo = await countIo(() => query(current.runtime));
    assert.equal(changedIo.markdownReads, 1);
    assert.equal(Object.keys(matter.cache).length, 0);
    output.search.push({ notes: count, firstQueryMs: first.elapsedMs, resultCount: first.resultCount, repeatedQueryMs: samples, medianMs: [...samples].sort((a, b) => a - b)[2], coldIo, warmIo, changedIo, parserCacheEntries: Object.keys(matter.cache).length });
    if (count < 10000) await current.runtime.dispose();
    largest = current;
  }
  const sentinelId = documentId(999999999999);
  await fs.promises.writeFile(path.join(largest.vault, 'zzzz-sentinel.md'), `---\nmemoflow_id: ${sentinelId}\n---\n# Unique sentinel\nonlybeyondscanlimit`);
  const scan = await largest.runtime.scanVault();
  assert.equal(scan.notes.length, 10001);
  const sentinel = await largest.runtime.searchVault({ query: 'onlybeyondscanlimit' });
  assert.equal(sentinel.results.length, 1);
  await assert.rejects(largest.runtime.writeConfirmedNote({ requestId: 'after-request', proposalId: 'after-proposal', proposalRevision: 1, knowledgeDocumentId: sentinelId, relativePath: 'zzzz-duplicate.md', contentMarkdown: '# Duplicate identity fixture' }), { code: 'CONFLICT' });
  output.scanCompleteness = { inputNotes: 10001, returnedNotes: scan.notes.length, sentinelSearchResults: sentinel.results.length, duplicateIdentityRejected: true };
  await largest.runtime.dispose();

  const vaultA = path.join(root, 'race', 'a');
  const vaultB = path.join(root, 'race', 'b');
  await fs.promises.mkdir(vaultA, { recursive: true });
  await fs.promises.mkdir(vaultB, { recursive: true });
  await fs.promises.writeFile(path.join(vaultA, 'same.md'), '# Title from A\ncontent-a');
  await fs.promises.writeFile(path.join(vaultB, 'same.md'), '# Title from B\nfrom-vault-b-only');
  let selected = vaultA;
  const racing = makeRuntime('race', async () => selected);
  await racing.selectVault();
  const originalRead = fs.promises.readFile;
  let started;
  let release;
  const readStarted = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  fs.promises.readFile = async (...args) => {
    if (String(args[0]).endsWith('same.md')) { started(); await gate; }
    return originalRead.apply(fs.promises, args);
  };
  try {
    const pending = racing.searchVault({ query: 'from-vault-b-only' });
    const rejected = assert.rejects(pending, { code: 'CONFLICT' });
    await readStarted;
    selected = vaultB;
    await racing.selectVault();
    release();
    await rejected;
    output.bindingRace = { staleSearchRejected: true, mixedVaultResultPublished: false };
  } finally { release(); fs.promises.readFile = originalRead; }
  await racing.dispose();

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
  assert.equal(Object.keys(matter.cache).length, 0);
  output.parserCache = { uniqueFiles: 1, versions: 200, bytesPerVersion: 65536, gcExposed: !!global.gc, snapshots };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (process.argv[2]) await fs.promises.writeFile(process.argv[2], serialized, { flag: 'wx' });
  else process.stdout.write(serialized);
} finally {
  await Promise.allSettled(runtimes.map(runtime => runtime.dispose()));
  await fs.promises.rm(root, { recursive: true, force: true });
}
