// Current production wrapper + real installed PowerSync SDK + temporary databases.
// Electron window broadcasting is stubbed; Worker construction is instrumented.
// node --expose-gc docs/analysis/evidence/2026-10-09-desktop-performance/powersync-wrapper-after.mjs [new-output.json]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url));
const schema = await import('../../../../packages/powersync-schema/dist/index.js');
const sourcePath = fileURLToPath(new URL('../../../../apps/desktop/src/main/database/powersync.ts', import.meta.url));
const source = await fs.promises.readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-powersync-after-'));
const activeWorkers = new Set();
const workers = [];
const observations = [];
let requestStarted = () => undefined;
const stalledServer = createServer(() => { requestStarted(); });
await new Promise(resolve => stalledServer.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${stalledServer.address().port}`;
let peakWorkers = 0;
class ObservedWorker extends Worker {
  constructor(filename, options) {
    // Node Worker disallows the parent's diagnostic --expose-gc flag.
    super(filename, { ...options, execArgv: [] });
    const id = this.threadId;
    activeWorkers.add(id);
    workers.push(new WeakRef(this));
    peakWorkers = Math.max(peakWorkers, activeWorkers.size);
    this.once('exit', () => activeWorkers.delete(id));
  }
}
const api = {};
vm.runInNewContext(compiled, {
  exports: api,
  AbortController,
  AbortSignal,
  fetch,
  console: { log() {}, warn: console.warn, error: console.error },
  require(id) {
    if (id === '@memoflow/powersync-schema') return schema;
    if (id === 'electron') return { app: { isPackaged: false }, BrowserWindow: { getAllWindows: () => [] } };
    if (id === 'node:worker_threads') return { Worker: ObservedWorker };
    if (id === '../utils/api-config') return { getApiBaseUrl: () => apiOrigin };
    if (id === './powersync-crud') return { serializeCrudTransaction() { throw new Error('Probe must remain local-only'); } };
    if (id === './powersync-table-changes') return { POWER_SYNC_CHANGE_TABLES: [], normalizePowerSyncTableName: x => x };
    if (id === './packaged-worker-path') return { resolvePackagedWorkerPath: x => x };
    return require(id);
  },
}, { filename: sourcePath });
const observe = (stage, extra = {}) => observations.push({ stage, activeWorkerCount: activeWorkers.size, ...extra });
const deadline = setTimeout(() => { console.error('Probe exceeded 45 seconds'); process.exit(124); }, 45_000);

try {
  const dbPath = path.join(root, 'profile-a.db');
  const first = await api.openPowerSyncLocalOnly(dbPath);
  observe('local-only-open');
  assert.ok(activeWorkers.size > 0);
  await first.execute('CREATE TABLE performance_persistence_probe (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await first.execute('INSERT INTO performance_persistence_probe (id, value) VALUES (?, ?)', ['proof', 'preserved']);
  await api.disablePowerSyncSyncMode();
  observe('local-only-after-disable-sync');
  await api.shutdownPowerSync();
  await delay(20);
  observe('after-shutdown');
  assert.equal(activeWorkers.size, 0);
  assert.equal(api.getPowerSyncDatabase(), null);

  const reopened = await api.openPowerSyncLocalOnly(dbPath);
  const proof = await reopened.get('SELECT value FROM performance_persistence_probe WHERE id = ?', ['proof']);
  assert.equal(proof.value, 'preserved');
  observe('reopened-with-data', { persisted: true });
  await api.shutdownPowerSync();
  assert.equal(activeWorkers.size, 0);

  for (let cycle = 0; cycle < 3; cycle++) {
    await api.openPowerSyncLocalOnly(path.join(root, `profile-${cycle}.db`));
    const closing = api.shutdownPowerSync();
    const next = api.openPowerSyncLocalOnly(path.join(root, `next-${cycle}.db`));
    await closing;
    await next;
    await api.shutdownPowerSync();
    assert.equal(api.getPowerSyncDatabase(), null);
    assert.equal(activeWorkers.size, 0);
    observe(`switch-cycle-${cycle + 1}-closed`);
  }

  const opening = api.openPowerSyncLocalOnly(path.join(root, 'cancel-opening.db'));
  const cancelled = assert.rejects(opening, /cancelled/);
  await api.shutdownPowerSync();
  await cancelled;
  assert.equal(api.getPowerSyncDatabase(), null);
  assert.equal(activeWorkers.size, 0);
  observe('shutdown-during-open');
  for (const action of ['disconnect', 'shutdown']) {
    await api.openPowerSyncLocalOnly(path.join(root, `stalled-${action}.db`));
    const requested = new Promise(resolve => { requestStarted = resolve; });
    const connecting = api.ensurePowerSyncSyncMode({ getAccessToken: async () => 'synthetic-test-token' }).then(() => 'connected', () => 'cancelled');
    await requested;
    if (action === 'disconnect') await api.disablePowerSyncSyncMode();
    else await api.shutdownPowerSync();
    assert.equal(await connecting, 'cancelled');
    observe(`stalled-credentials-after-${action}`);
    await api.shutdownPowerSync();
    assert.equal(activeWorkers.size, 0);
  }
  const output = {
    recordedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    sdkVersion: JSON.parse(await fs.promises.readFile(new URL('../../../../node_modules/@powersync/node/package.json', import.meta.url), 'utf8')).version,
    scope: 'Unmodified production wrapper transpiled with TypeScript; real SDK and schema, temporary DBs, observed real Workers; fake Electron window list. A loopback HTTP server intentionally stalls credential requests; no real cloud. Linux Node, not a Windows packaged app.',
    peakWorkers,
    observations,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (process.argv[2]) await fs.promises.writeFile(process.argv[2], serialized, { flag: 'wx' });
  else process.stdout.write(serialized);
} finally {
  await api.shutdownPowerSync().catch(() => undefined);
  stalledServer.closeAllConnections();
  await new Promise(resolve => stalledServer.close(resolve));
  await Promise.allSettled(workers.map(ref => ref.deref()?.terminate()));
  clearTimeout(deadline);
  await fs.promises.rm(root, { recursive: true, force: true });
}
