#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildDeliveryManifest } from './generate-delivery-manifest.mjs';
import { validateDispatch } from './lib/dispatch.mjs';

export async function replayCiMatrix({ check = true } = {}) {
  const fixture = JSON.parse(
    await readFile(
      new URL('./__tests__/fixtures/pr-dispatch-matrix.json', import.meta.url),
      'utf8',
    ),
  );
  const results = [];
  for (const entry of fixture.cases) {
    for (const file of entry.files) await readFile(file);
    const manifest = await buildDeliveryManifest({
      files: entry.files,
      event: entry.event ?? 'pull_request',
      ref: entry.event === 'push' ? 'refs/heads/main' : undefined,
      head: 'matrix-replay',
    });
    validateDispatch(manifest);
    const actual = {
      full: manifest.full,
      targets: manifest.scope.tasks,
      jobs: Object.fromEntries(
        Object.entries(manifest.dispatch.jobs).map(([id, detail]) => [
          id,
          detail.tasks.map((task) => task.key),
        ]),
      ),
      serverShards: manifest.dispatch.serverShards,
    };
    if (check) assert.deepEqual(actual, entry.expected, entry.id);
    results.push({
      id: entry.id,
      files: entry.files,
      expected: entry.expected,
      actual,
      manifestDigest: manifest.digest,
      skips: Object.fromEntries(
        Object.entries(manifest.dispatch.jobs)
          .filter(([, p]) => !p.required)
          .map(([id, p]) => [id, p.skipReason]),
      ),
      receiptExecution:
        'unverified: replay computes the real Nx plan; it does not execute product suites',
    });
  }
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] ?? 'reports/ci-cd-platform/p1-acceptance-matrix.json';
  const results = await replayCiMatrix();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  console.log(
    `[ci-matrix] ${results.length} real Nx replay cases passed; product task execution is not claimed`,
  );
}
