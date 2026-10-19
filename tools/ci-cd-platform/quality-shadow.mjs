#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digest } from './lib/contracts.mjs';
import { UNIT_JOB_IDS, unitJobEnabled } from './lib/unit-shards.mjs';

export const QUALITY_CHILDREN = Object.freeze({
  static:
    'node ./tools/test-system-v2/run-command.mjs -- pnpm exec nx affected -t lint --parallel=3 --exclude=memoflow --outputStyle=static',
  ...Object.fromEntries(
    UNIT_JOB_IDS.map((id) => [id, `node ./tools/ci-cd-platform/run-unit-shard.mjs ${id}`]),
  ),
  typecheck:
    'node ./tools/test-system-v2/run-command.mjs -- pnpm exec nx affected -t typecheck --parallel=3 --outputStyle=static',
  build:
    "node ./tools/test-system-v2/run-command.mjs -- pnpm exec nx affected -t build --parallel=3 --exclude='contracts,utils,ui-core,assets,sync-client' --outputStyle=static",
});

export const QUALITY_CHILD_NAMES = Object.freeze(Object.keys(QUALITY_CHILDREN));
const SHA40 = /^[0-9a-f]{40}$/u;
const DIGEST64 = /^[0-9a-f]{64}$/u;

function positiveInteger(value, field) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${field} must be a non-negative integer`);
  return parsed;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Quality shadow contract invalid: ${message}`);
}

function assertSelfDigest(value, field) {
  assert(DIGEST64.test(value?.digest ?? ''), `${field}.digest must be sha256`);
  const content = { ...value };
  delete content.digest;
  assert(value.digest === digest(content), `${field}.digest does not match content`);
}

export function validateQualityShadowChild(receipt) {
  assert(receipt?.kind === 'quality-shadow-child-v1', 'child kind');
  assert(receipt.version === 1, 'child version');
  assert(['split', 'consolidated'].includes(receipt.profile), 'child profile');
  assert(QUALITY_CHILD_NAMES.includes(receipt.child), 'child name');
  assert(receipt.command === QUALITY_CHILDREN[receipt.child], 'child command drift');
  assert(
    typeof receipt.workload?.name === 'string' && receipt.workload.name.length > 0,
    'workload name',
  );
  assert(SHA40.test(receipt.workload?.base ?? ''), 'workload base');
  assert(SHA40.test(receipt.workload?.head ?? ''), 'workload head');
  assert(SHA40.test(receipt.controlPlaneSha ?? ''), 'control-plane sha');
  assert(typeof receipt.runId === 'string' && receipt.runId.length > 0, 'run id');
  assert(typeof receipt.jobKey === 'string' && receipt.jobKey.length > 0, 'job key');
  for (const field of [
    'jobStartedAtMs',
    'setupStartedAtMs',
    'setupEndedAtMs',
    'startedAtMs',
    'endedAtMs',
    'executionMs',
  ]) {
    assert(Number.isInteger(receipt[field]) && receipt[field] >= 0, field);
  }
  assert(receipt.setupEndedAtMs >= receipt.setupStartedAtMs, 'setup ordering');
  assert(receipt.startedAtMs >= receipt.setupEndedAtMs, 'execution starts after setup');
  assert(receipt.endedAtMs >= receipt.startedAtMs, 'execution ordering');
  assert(receipt.executionMs === receipt.endedAtMs - receipt.startedAtMs, 'execution duration');
  assert(['success', 'failure'].includes(receipt.status), 'child status');
  assert(Number.isInteger(receipt.exitCode) && receipt.exitCode >= 0, 'exit code');
  assert((receipt.exitCode === 0) === (receipt.status === 'success'), 'status/exitCode parity');
  assertSelfDigest(receipt, 'child');
  return receipt;
}

function sameWorkload(left, right) {
  return left.name === right.name && left.base === right.base && left.head === right.head;
}

function timingForProfile(receipts, profile) {
  const selected = receipts.filter((receipt) => receipt.profile === profile);
  assert(
    selected.length === QUALITY_CHILD_NAMES.length,
    `${profile} must contain six child receipts`,
  );
  const byChild = new Map(selected.map((receipt) => [receipt.child, receipt]));
  assert(byChild.size === QUALITY_CHILD_NAMES.length, `${profile} child receipts must be unique`);
  for (const child of QUALITY_CHILD_NAMES)
    assert(byChild.has(child), `${profile} missing ${child}`);

  const jobGroups = new Map();
  for (const receipt of selected) {
    const existing = jobGroups.get(receipt.jobKey) ?? [];
    existing.push(receipt);
    jobGroups.set(receipt.jobKey, existing);
  }
  assert(
    profile === 'split' ? jobGroups.size === QUALITY_CHILD_NAMES.length : jobGroups.size === 1,
    `${profile} physical job topology`,
  );

  let setupMs = 0;
  let runnerMs = 0;
  for (const group of jobGroups.values()) {
    const first = group[0];
    assert(
      group.every((entry) => entry.setupStartedAtMs === first.setupStartedAtMs),
      'shared job setup start drift',
    );
    assert(
      group.every((entry) => entry.setupEndedAtMs === first.setupEndedAtMs),
      'shared job setup end drift',
    );
    assert(
      group.every((entry) => entry.jobStartedAtMs === first.jobStartedAtMs),
      'shared job start drift',
    );
    const jobEnd = Math.max(...group.map((entry) => entry.endedAtMs));
    setupMs += first.setupEndedAtMs - first.setupStartedAtMs;
    runnerMs += jobEnd - first.jobStartedAtMs;
  }

  return {
    commit: selected[0].controlPlaneSha,
    runId: selected[0].runId,
    lanes: [...QUALITY_CHILD_NAMES].sort(),
    setupMs,
    executionMs: selected.reduce((total, entry) => total + entry.executionMs, 0),
    longestLaneMs: Math.max(...selected.map((entry) => entry.executionMs)),
    wallClockMs:
      Math.max(...selected.map((entry) => entry.endedAtMs)) -
      Math.min(...selected.map((entry) => entry.jobStartedAtMs)),
    runnerMinutes: runnerMs / 60_000,
  };
}

export function buildQualityShadowSample(receipts) {
  receipts.forEach(validateQualityShadowChild);
  assert(
    receipts.length === QUALITY_CHILD_NAMES.length * 2,
    'paired sample must contain exactly twelve receipts',
  );
  const first = receipts[0];
  assert(
    receipts.every((entry) => entry.runId === first.runId),
    'run id mismatch',
  );
  assert(
    receipts.every((entry) => entry.controlPlaneSha === first.controlPlaneSha),
    'control-plane mismatch',
  );
  assert(
    receipts.every((entry) => sameWorkload(entry.workload, first.workload)),
    'workload mismatch',
  );

  for (const child of QUALITY_CHILD_NAMES) {
    const split = receipts.find((entry) => entry.profile === 'split' && entry.child === child);
    const consolidated = receipts.find(
      (entry) => entry.profile === 'consolidated' && entry.child === child,
    );
    assert(split && consolidated, `paired ${child} receipts required`);
    assert(split.command === consolidated.command, `${child} command parity`);
  }

  const childStatuses = Object.fromEntries(
    QUALITY_CHILD_NAMES.map((child) => [
      child,
      {
        split: receipts.find((entry) => entry.profile === 'split' && entry.child === child).status,
        consolidated: receipts.find(
          (entry) => entry.profile === 'consolidated' && entry.child === child,
        ).status,
      },
    ]),
  );
  const success = Object.values(childStatuses).every(
    ({ split, consolidated }) => split === 'success' && consolidated === 'success',
  );
  const sample = {
    kind: 'quality-shadow-sample-v1',
    version: 1,
    workload: first.workload,
    controlPlaneSha: first.controlPlaneSha,
    runId: first.runId,
    status: success ? 'success' : 'failure',
    children: childStatuses,
    split: timingForProfile(receipts, 'split'),
    consolidated: timingForProfile(receipts, 'consolidated'),
    provenance: { generator: 'ci-cd-platform-v3/quality-shadow@1' },
  };
  sample.digest = digest(sample);
  validateQualityShadowSample(sample);
  return sample;
}

export function validateQualityShadowSample(sample) {
  assert(sample?.kind === 'quality-shadow-sample-v1', 'sample kind');
  assert(sample.version === 1, 'sample version');
  assert(
    typeof sample.workload?.name === 'string' && sample.workload.name.length > 0,
    'sample workload name',
  );
  assert(
    SHA40.test(sample.workload?.base ?? '') && SHA40.test(sample.workload?.head ?? ''),
    'sample workload sha',
  );
  assert(SHA40.test(sample.controlPlaneSha ?? ''), 'sample control-plane sha');
  assert(['success', 'failure'].includes(sample.status), 'sample status');
  assert(sample.children && typeof sample.children === 'object', 'sample children');
  assert(
    Object.keys(sample.children).sort().join(',') === [...QUALITY_CHILD_NAMES].sort().join(','),
    'sample child set',
  );
  let allChildrenSucceeded = true;
  for (const child of QUALITY_CHILD_NAMES) {
    const status = sample.children[child];
    assert(status && typeof status === 'object', `${child} status`);
    assert(['success', 'failure'].includes(status.split), `${child}.split status`);
    assert(['success', 'failure'].includes(status.consolidated), `${child}.consolidated status`);
    allChildrenSucceeded &&= status.split === 'success' && status.consolidated === 'success';
  }
  assert(
    (sample.status === 'success') === allChildrenSucceeded,
    'sample status must equal child parity status',
  );
  for (const profile of ['split', 'consolidated']) {
    const timing = sample[profile];
    assert(timing && typeof timing === 'object', `${profile} timing`);
    assert(timing.commit === sample.controlPlaneSha, `${profile} control-plane identity`);
    assert(timing.runId === sample.runId, `${profile} run identity`);
    for (const field of [
      'setupMs',
      'executionMs',
      'longestLaneMs',
      'wallClockMs',
      'runnerMinutes',
    ]) {
      assert(Number.isFinite(timing[field]) && timing[field] >= 0, `${profile}.${field}`);
    }
    assert(
      Array.isArray(timing.lanes) &&
        timing.lanes.join(',') === [...QUALITY_CHILD_NAMES].sort().join(','),
      `${profile} lanes`,
    );
  }
  assertSelfDigest(sample, 'sample');
  return sample;
}

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await jsonFiles(target)));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(target);
  }
  return files.sort();
}

export async function readQualityShadowChildren(directory) {
  const receipts = [];
  for (const file of await jsonFiles(directory)) {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (value?.kind === 'quality-shadow-child-v1') receipts.push(value);
  }
  return receipts;
}

async function runChild({ profile, child, output, workloadName }) {
  const command = QUALITY_CHILDREN[child];
  if (!command) throw new Error(`unknown quality shadow child: ${child}`);
  const base = process.env.NX_BASE ?? '';
  const head = process.env.NX_HEAD ?? '';
  const controlPlaneSha = process.env.GITHUB_SHA ?? '';
  const runId = process.env.GITHUB_RUN_ID ?? 'local';
  const jobKey = process.env.QUALITY_JOB_KEY ?? `${profile}-${child}`;
  const jobStartedAtMs = positiveInteger(
    process.env.QUALITY_JOB_STARTED_AT ?? Date.now(),
    'QUALITY_JOB_STARTED_AT',
  );
  const setupStartedAtMs = positiveInteger(
    process.env.WORKSPACE_SETUP_STARTED_AT ?? jobStartedAtMs,
    'WORKSPACE_SETUP_STARTED_AT',
  );
  const setupEndedAtMs = positiveInteger(
    process.env.WORKSPACE_SETUP_ENDED_AT ?? Date.now(),
    'WORKSPACE_SETUP_ENDED_AT',
  );
  const startedAtMs = Date.now();
  const selected =
    !UNIT_JOB_IDS.includes(child) ||
    unitJobEnabled(JSON.parse(await readFile(process.env.DELIVERY_MANIFEST_PATH, 'utf8')), child);
  const exitCode = !selected
    ? 0
    : await new Promise((resolveExit, reject) => {
        const processChild = spawn('/bin/bash', ['-lc', command], {
          stdio: 'inherit',
          env: {
            ...process.env,
            DELIVERY_LANE: 'validate',
            TEST_REPORT_NAME: `quality-shadow-${profile}-${child}`,
            TEST_REPORTS_DIR: `reports/quality-shadow/test-system/${profile}/${child}`,
          },
        });
        processChild.on('error', reject);
        processChild.on('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
      });
  const endedAtMs = Date.now();
  const receipt = {
    kind: 'quality-shadow-child-v1',
    version: 1,
    profile,
    child,
    command,
    workload: { name: workloadName, base, head },
    controlPlaneSha,
    runId,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
    jobKey,
    jobStartedAtMs,
    setupStartedAtMs,
    setupEndedAtMs,
    startedAtMs,
    endedAtMs,
    executionMs: endedAtMs - startedAtMs,
    status: exitCode === 0 ? 'success' : 'failure',
    exitCode,
    provenance: { generator: 'ci-cd-platform-v3/quality-shadow-child@1' },
  };
  receipt.digest = digest(receipt);
  validateQualityShadowChild(receipt);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'run-child') {
    const options = new Map();
    for (let index = 0; index < args.length; index += 2)
      options.set(args[index].replace(/^--/u, ''), args[index + 1]);
    const receipt = await runChild({
      profile: options.get('profile'),
      child: options.get('child'),
      output: path.resolve(options.get('output')),
      workloadName: options.get('workload') ?? 'desktop-pr286',
    });
    if (receipt.status !== 'success') process.exitCode = 1;
    return;
  }
  if (command === 'build-sample') {
    const options = new Map();
    for (let index = 0; index < args.length; index += 2)
      options.set(args[index].replace(/^--/u, ''), args[index + 1]);
    const input = path.resolve(options.get('input'));
    const output = path.resolve(options.get('output'));
    const sample = buildQualityShadowSample(await readQualityShadowChildren(input));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(sample, null, 2)}\n`);
    console.log(
      JSON.stringify(
        { output, status: sample.status, split: sample.split, consolidated: sample.consolidated },
        null,
        2,
      ),
    );
    if (sample.status !== 'success') process.exitCode = 1;
    return;
  }
  throw new Error('usage: quality-shadow.mjs run-child|build-sample ...');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[quality-shadow] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
