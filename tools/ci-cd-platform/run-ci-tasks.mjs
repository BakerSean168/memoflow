#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { successfulNxStatus } from './lib/nx-build-tasks.mjs';
import { execFileSync } from 'node:child_process';
import { digest, validateDeliveryManifest } from './lib/contracts.mjs';
import { LINT_TASKS, validateDispatch, batchCommand, buildCommand } from './lib/dispatch.mjs';

const [job, selector, expectedTarget] = process.argv.slice(2);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (process.env.GITHUB_SHA && sha !== process.env.GITHUB_SHA)
  throw new Error('Task checkout differs from run SHA');
let manifest = null;
let tasks;
if (job === 'lint') tasks = LINT_TASKS;
else {
  manifest = validateDeliveryManifest(
    JSON.parse(
      await readFile(
        process.env.DELIVERY_MANIFEST_PATH ?? 'scope/delivery-manifest-v1.json',
        'utf8',
      ),
    ),
  );
  const plan = validateDispatch(manifest);
  if (manifest.commit !== sha || manifest.head !== sha)
    throw new Error('Task manifest checkout mismatch');
  if (!plan.jobs[job]?.required) throw new Error(`Disabled or unknown CI job: ${job}`);
  tasks = plan.jobs[job].tasks;
}
if (selector) tasks = tasks.filter((task) => task.key === selector || task.executor === selector);
if (process.env.CI_WEB_SHARD)
  tasks = tasks.filter(
    (task) =>
      task.shard === process.env.CI_WEB_SHARD ||
      (!task.shard && process.env.CI_WEB_SHARD.startsWith('1/')),
  );
if (process.env.CI_SERVER_SHARD) {
  const shard = manifest?.dispatch.serverShards.find((s) => s.id === process.env.CI_SERVER_SHARD);
  if (job !== 'verification-children' || !shard) throw new Error('Unknown Server resource shard');
  tasks = tasks.filter((task) => shard.keys.includes(task.key));
}
if (!tasks.length) throw new Error('Refusing an empty required task execution');
if (expectedTarget && tasks.some((task) => `${task.project}:${task.target}` !== expectedTarget))
  throw new Error('Workflow target binding differs from the selected tasks');
const run = async (command, name) => {
  const started = Date.now();
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['tools/test-system-v2/run-command.mjs', '--', ...command],
      {
        stdio: 'inherit',
        env: { ...process.env, TEST_REPORT_NAME: name, TEST_RETRY_INFRASTRUCTURE: 'false' },
      },
    );
    child.on('error', (error) => resolve({ exitCode: null, error: error.message }));
    child.on('close', (code, signal) => resolve({ exitCode: code, signal }));
  });
  return { ...result, durationMs: Date.now() - started };
};
await mkdir('reports/ci-tasks', { recursive: true });
// One Nx scheduler per homogeneous build/typecheck batch retains dependencies,
// cache restoration and task parallelism; no cross product of unrelated targets.
if (job.startsWith('unit-') || job.startsWith('web-unit-') || job === 'server-unit') {
  const setup = await run(
    ['pnpm', 'exec', 'nx', 'run', 'contracts:build', '--outputStyle=static'],
    `${job}-contracts-build`,
  );
  if (setup.exitCode !== 0 || setup.signal || setup.error)
    throw new Error('Unit runtime contracts build failed');
}
const batches = job === 'build' ? [tasks] : tasks.map((task) => [task]);
for (const batch of batches) {
  const command = job === 'build' ? buildCommand(batch) : batchCommand(batch);
  const name = `${job}-${digest(batch.map((t) => t.key)).slice(0, 16)}`;
  if (job === 'build')
    await rm(`reports/ci-tasks/nx-build-${digest(batch.map((t) => t.key))}.result`, {
      force: true,
    });
  const result = await run(command, name);
  let nxResults = null;
  if (job === 'build') {
    try {
      nxResults = JSON.parse(
        await readFile(
          `reports/ci-tasks/nx-build-${digest(batch.map((t) => t.key))}.result`,
          'utf8',
        ),
      );
    } catch {
      /* Missing scheduler results must fail each primary receipt closed. */
    }
  }
  for (const task of batch) {
    const nx = nxResults?.tasks?.[task.key];
    const receipt = {
      kind: 'ci-task-receipt-v1',
      version: 1,
      job,
      key: task.key,
      resourceShard: process.env.CI_SERVER_SHARD ?? null,
      taskDigest: digest(task),
      planDigest: digest(tasks === LINT_TASKS ? LINT_TASKS : manifest.dispatch.jobs[job].tasks),
      commit: sha,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
      manifestDigest: manifest?.digest ?? null,
      command,
      ...result,
      ...(job === 'build'
        ? {
            nx: nx ?? null,
            exitCode:
              result.exitCode === 0 && nxResults?.completed && successfulNxStatus(nx?.status)
                ? 0
                : 1,
          }
        : {}),
    };
    if (receipt.exitCode !== 0) process.exitCode = 1;
    receipt.digest = digest(receipt);
    await writeFile(
      `reports/ci-tasks/${digest({ job, key: task.key })}.json`,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
  }
  if (result.exitCode !== 0 || result.signal || result.error) process.exitCode = 1;
}
