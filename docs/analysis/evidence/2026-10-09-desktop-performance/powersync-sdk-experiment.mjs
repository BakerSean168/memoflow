// Isolated SDK lifecycle probe, using empty temporary databases and no connector.
// node --expose-gc docs/analysis/evidence/2026-10-09-desktop-performance/powersync-sdk-experiment.mjs [new-output.json]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { PowerSyncDatabase } from '@powersync/node';
import { Schema } from '@powersync/common';

if (!global.gc) throw new Error('Run this research probe with --expose-gc');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-powersync-lifecycle-'));
const active = new Set();
const weakWorkers = [];
const observations = [];
let explicitDb;
let discarded;
const observe = (stage, extras = {}) => {
  observations.push({ stage, activeWorkerCount: active.size, ...extras });
};
const openWorker = (url, options) => {
  // Worker does not accept the parent's diagnostic --expose-gc flag.
  const worker = new Worker(url, { ...options, execArgv: [] });
  const id = worker.threadId;
  active.add(id);
  weakWorkers.push(new WeakRef(worker));
  worker.once('exit', () => active.delete(id));
  return worker;
};
const createDb = filename => new PowerSyncDatabase({
  schema: new Schema({}),
  database: { dbLocation: temp, dbFilename: filename, openWorker },
});
async function openThenDiscard() {
  const db = createDb('discarded.db');
  await db.init();
  await db.disconnect();
  observe('discarded-after-init-and-disconnect');
  return new WeakRef(db);
}
const deadline = setTimeout(() => {
  console.error('Isolated lifecycle probe exceeded its 30 second bound');
  process.exit(124);
}, 30000);

try {
  explicitDb = createDb('explicit.db');
  await explicitDb.init();
  observe('explicit-after-init');
  await explicitDb.disconnect();
  observe('explicit-after-disconnect');
  await explicitDb.close();
  explicitDb = undefined;
  observe('explicit-after-close');

  discarded = await openThenDiscard();
  for (let round = 0; round < 20; round++) {
    await delay(50);
    global.gc();
  }
  await delay(100);
  observe('discarded-after-20-gc-rounds', { databaseObjectStillReachable: !!discarded.deref() });
  await discarded.deref()?.close();
  observe('discarded-after-explicit-close');
  const output = {
    recordedAt: new Date().toISOString(),
    runtime: { node: process.versions.node, modules: process.versions.modules, platform: process.platform, arch: process.arch },
    versions: {
      powersyncNode: JSON.parse(await fs.readFile(new URL('../../../../node_modules/@powersync/node/package.json', import.meta.url), 'utf8')).version,
      powersyncCommon: JSON.parse(await fs.readFile(new URL('../../../../node_modules/@powersync/common/package.json', import.meta.url), 'utf8')).version,
    },
    notes: 'Empty Schema; no connector or network; temporary databases. Twenty GC rounds with 50ms delay; the harness retains no strong Worker or discarded DB references. This is SDK behavior, not whole-app performance.',
    observations,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (process.argv[2]) await fs.writeFile(process.argv[2], serialized, { flag: 'wx' });
  else process.stdout.write(serialized);
} finally {
  await explicitDb?.close().catch(() => undefined);
  await Promise.allSettled(weakWorkers.map(ref => ref.deref()?.terminate()));
  clearTimeout(deadline);
  await fs.rm(temp, { recursive: true, force: true });
}
