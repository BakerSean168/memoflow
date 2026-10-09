// Deterministic boundary experiment. The production wrapper is transpiled unchanged;
// Electron and PowerSync are fakes. This does not measure a running desktop app.
// node docs/analysis/evidence/2026-10-09-desktop-performance/powersync-wrapper-experiment.mjs [new-output.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = fileURLToPath(new URL('../../../../apps/desktop/src/main/database/powersync.ts', import.meta.url));
const source = await fs.promises.readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-powersync-wrapper-'));

function loadWrapper() {
  const databases = [];
  class FakeDatabase {
    constructor(options) {
      this.path = options.database.dbFilename;
      this.disconnectCalls = 0;
      this.closeCalls = 0;
      this.ready = new Promise(resolve => { this.finishOpening = resolve; });
      databases.push(this);
    }
    waitForReady() { return this.ready; }
    onChange() { return () => undefined; }
    async disconnect() { this.disconnectCalls++; }
    async close() { this.closeCalls++; }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    console: { log() {}, error() {}, warn() {} },
    require(id) {
      if (id === '@powersync/node') return { PowerSyncDatabase: FakeDatabase };
      if (id === 'electron') return { app: { isPackaged: false }, BrowserWindow: { getAllWindows: () => [] } };
      if (id === '@memoflow/powersync-schema') return { PowerSyncAppSchema: {} };
      if (id === '../utils/api-config') return { getApiBaseUrl: () => 'http://127.0.0.1:1' };
      if (id === './powersync-crud') return { serializeCrudTransaction: () => [] };
      if (id === './powersync-table-changes') return { POWER_SYNC_CHANGE_TABLES: [], normalizePowerSyncTableName: x => x };
      if (id === './packaged-worker-path') return { resolvePackagedWorkerPath: x => x };
      if (['path', 'fs', 'node:worker_threads'].includes(id)) return require(id);
      throw new Error(`Unexpected import: ${id}`);
    },
  }, { filename: sourcePath });
  return { api: exports, databases };
}

try {
  const shutdown = loadWrapper();
  const opening = shutdown.api.openPowerSyncLocalOnly(path.join(root, 'shutdown-a.db'));
  await shutdown.api.shutdownPowerSync();
  shutdown.databases[0].finishOpening();
  await opening;
  const shutdownDuringOpen = {
    databasePublishedAfterShutdownReturned: shutdown.api.getPowerSyncDatabase() !== null,
    closeCalls: shutdown.databases[0].closeCalls,
    disconnectCalls: shutdown.databases[0].disconnectCalls,
  };
  await shutdown.api.shutdownPowerSync();

  const concurrent = loadWrapper();
  const first = concurrent.api.openPowerSyncLocalOnly(path.join(root, 'profile-a.db'));
  const second = concurrent.api.openPowerSyncLocalOnly(path.join(root, 'profile-b.db'));
  concurrent.databases[0].finishOpening();
  const [a, b] = await Promise.all([first, second]);
  const differentPathsDuringOpen = {
    createdInstances: concurrent.databases.length,
    sameDatabaseReturnedToBothCallers: a === b,
    secondCallerReceivedFirstPath: path.basename(b.path) === 'profile-a.db',
  };
  await concurrent.api.shutdownPowerSync();

  const output = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    source: 'apps/desktop/src/main/database/powersync.ts',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    scope: 'Unmodified production wrapper, fake DB and Electron; protocol counterexamples, not an end-to-end incident or performance measurement.',
    shutdownDuringOpen,
    differentPathsDuringOpen,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (process.argv[2]) await fs.promises.writeFile(process.argv[2], serialized, { flag: 'wx' });
  else process.stdout.write(serialized);
} finally {
  await fs.promises.rm(root, { recursive: true, force: true });
}
