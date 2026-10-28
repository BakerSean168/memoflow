#!/usr/bin/env node
// Online acceptance uses the production selector/manifest/dispatch, never imports
// synthetic configurations. Run after recording in a fresh CI pipeline context.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { buildDeliveryManifest } from './generate-delivery-manifest.mjs';
import { validateDispatch, batchCommand } from './lib/dispatch.mjs';

const output = 'reports/ultracache';
const probe = 'packages/shared-primitives/src/ultracache-acceptance-probe.txt';
const scenarios = {
  unrelated: probe,
  contract: 'packages/task-workspace-contracts/src/task-workspace.dto.ts',
};
const mode = process.argv[2];
const projects = [
  'goal-contracts',
  'task-contracts',
  'goal-workspace-contracts',
  'task-workspace-contracts',
];
await mkdir(output, { recursive: true });

if (mode === 'baseline' || mode === 'cloud') {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const results = {};
  for (const [scenario, file] of Object.entries(scenarios)) {
    const started = Date.now();
    const native = execFileSync(
      'pnpm',
      ['exec', 'nx', 'affected', '-t', 'test:contract', `--files=${file}`, '--explain=stdout'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    await writeFile(`${output}/${mode}-${scenario}-native.txt`, native);
    const explanation = JSON.parse(native.slice(native.indexOf('{')));
    const nativeTargets = Object.keys(explanation.affected)
      .filter((id) => id.endsWith(':test:contract'))
      .sort();
    const manifest = await buildDeliveryManifest({
      files: [file],
      head,
      base: null,
      full: false,
      event: 'pull_request',
      ref: 'refs/heads/ultracache-acceptance',
    });
    assert.equal(manifest.scope.selection.fallback, null);
    const dispatch = validateDispatch(manifest);
    const contractTargets = dispatch.jobs.contract.tasks.map((task) => task.key).sort();
    assert.deepEqual(
      contractTargets,
      nativeTargets,
      'Native and production Contract selection differ',
    );
    const commands = dispatch.jobs.contract.tasks.map((task) => batchCommand([task]));
    assert.equal(commands.length, contractTargets.length);
    await writeFile(
      `${output}/${mode}-${scenario}-manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
    results[scenario] = {
      nativeTargets,
      contractTargets,
      commands,
      dispatchedTasks: Object.values(dispatch.jobs).reduce((n, job) => n + job.tasks.length, 0),
      ultracache: manifest.scope.selection.ultracache,
      elapsedMs: Date.now() - started,
    };
  }
  await writeFile(`${output}/${mode}-selection.json`, JSON.stringify(results, null, 2));
} else {
  // Keep the probe out of the committed product. Its bytes really change, while
  // --files asks both planners about exactly that isolated change.
  let original;
  try {
    original = await readFile(probe);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(probe, `Unread input probe ${process.env.GITHUB_RUN_ID ?? 'local'}\n`);
    execFileSync(process.execPath, [process.argv[1], 'baseline'], {
      stdio: 'inherit',
      env: { ...process.env, NX_NO_CLOUD: 'true' },
    });
    execFileSync(process.execPath, [process.argv[1], 'cloud'], {
      stdio: 'inherit',
      env: { ...process.env, NX_NO_CLOUD: 'false' },
    });
    const baseline = JSON.parse(await readFile(`${output}/baseline-selection.json`, 'utf8'));
    const cloud = JSON.parse(await readFile(`${output}/cloud-selection.json`, 'utf8'));
    assert(cloud.unrelated.ultracache.tasks > 0, 'Cloud returned no configurations');
    assert(
      cloud.unrelated.contractTargets.length < baseline.unrelated.contractTargets.length,
      'Production dispatch did not remove unrelated Contract tasks',
    );
    for (const project of projects) {
      assert(baseline.unrelated.contractTargets.includes(`${project}:test:contract`));
      assert(!cloud.unrelated.contractTargets.includes(`${project}:test:contract`), project);
      assert(cloud.unrelated.ultracache.used.includes(`${project}:test:contract`), project);
    }
    for (const id of baseline.contract.contractTargets) {
      assert(cloud.contract.contractTargets.includes(id), `Lost real contract dependency: ${id}`);
    }
    assert(cloud.contract.contractTargets.includes('task-workspace-contracts:test:contract'));
    const summary = Object.fromEntries(
      Object.keys(scenarios).map((scenario) => [
        scenario,
        {
          baselineContract: baseline[scenario].contractTargets.length,
          cloudContract: cloud[scenario].contractTargets.length,
          baselineDispatch: baseline[scenario].dispatchedTasks,
          cloudDispatch: cloud[scenario].dispatchedTasks,
        },
      ]),
    );
    await writeFile(`${output}/affected-summary.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (original) await writeFile(probe, original);
    else await rm(probe, { force: true });
  }
}
