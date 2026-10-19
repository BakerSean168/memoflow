#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  digest,
  validateLaneInput,
  validateLaneResult,
  validateLaneSummary,
  validateWorkspaceReceipt,
} from './lib/contracts.mjs';
import { getLaneDefinition } from './lib/registry.mjs';

async function readJsonFiles(directory, predicate) {
  let names = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const values = [];
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const file = path.join(directory, name);
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (predicate(value, name)) values.push({ file, value });
  }
  return values;
}

export async function observeLane({ lane, input, reportsDir, receipt = null, output }) {
  const definition = getLaneDefinition(lane);
  validateLaneInput(input);
  if (receipt) {
    validateWorkspaceReceipt(receipt);
    if (receipt.commit !== input.commit) {
      throw new Error(`Workspace receipt commit does not match lane input for ${lane}`);
    }
  }
  const reports = await readJsonFiles(
    reportsDir,
    (value) =>
      value &&
      value.version === 1 &&
      value.lane === lane &&
      Array.isArray(value.attempts) &&
      value.name,
  );
  const laneResults = await readJsonFiles(
    reportsDir,
    (value) => value?.kind === 'lane-result-v1' && value.lane === lane,
  );
  for (const { value } of laneResults) {
    validateLaneResult(value);
    if (value.commit !== input.commit || value.manifestDigest !== input.manifestDigest) {
      throw new Error(`Lane result provenance does not match lane input for ${lane}`);
    }
    if (value.laneInputDigest !== input.digest) {
      throw new Error(`Lane result references a different lane input for ${lane}`);
    }
  }

  const failures = [];
  if (reports.length === 0 && laneResults.length === 0) {
    failures.push({ report: reportsDir, classification: 'infrastructure' });
  }
  failures.push(
    ...reports.flatMap(({ file, value }) =>
      value.result === 'success'
        ? []
        : [{ report: file, classification: value.attempts.at(-1)?.classification ?? 'assertion' }],
    ),
  );
  failures.push(
    ...laneResults.flatMap(({ file, value }) =>
      value.status === 'success'
        ? []
        : [{ report: file, classification: value.failure.classification }],
    ),
  );
  const attempts = reports.flatMap(({ value }) => value.attempts);
  const executionMs = attempts.reduce((total, attempt) => total + (attempt.durationMs ?? 0), 0);
  const testSummaries = reports.map(({ value }) => value.testSummary).filter(Boolean);
  const testTotals = {
    reportCount: testSummaries.reduce((total, value) => total + (value.reportCount ?? 0), 0),
    files: { total: 0, passed: 0, failed: 0, skipped: 0 },
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, retries: 0 },
    slowestSpecs: testSummaries
      .flatMap((value) => value.slowestSpecs ?? [])
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 10),
    slowestTests: testSummaries
      .flatMap((value) => value.slowestTests ?? [])
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 10),
  };
  for (const value of testSummaries) {
    for (const field of ['total', 'passed', 'failed', 'skipped']) {
      testTotals.files[field] += value.files?.[field] ?? 0;
      testTotals.tests[field] += value.tests?.[field] ?? 0;
    }
    testTotals.tests.retries += value.tests?.retries ?? 0;
  }
  const summary = {
    kind: 'lane-summary-v1',
    version: 1,
    lane,
    commit: input.commit,
    manifestDigest: input.manifestDigest,
    laneInputDigest: input.digest,
    status: failures.length === 0 ? 'success' : 'failure',
    owner: definition.owner,
    timing: {
      setupMs: receipt?.timing?.setupMs ?? null,
      commandCount: reports.length,
      attemptCount: attempts.length,
      executionMs,
      longestCommandMs: Math.max(0, ...attempts.map((attempt) => attempt.durationMs ?? 0)),
    },
    failures,
    tests: testTotals,
    cache: receipt?.cache ?? null,
    toolchain: receipt?.toolchain ?? null,
    evidence: {
      reports: reports.map(({ file }) => file),
      laneResults: laneResults.map(({ file }) => file),
    },
    provenance: {
      generator: 'ci-cd-platform-v2/observe-lane@1',
      runner: process.env.RUNNER_OS ?? process.platform,
      runId: process.env.GITHUB_RUN_ID ?? null,
      job: process.env.GITHUB_JOB ?? null,
      ...(process.env.UNIT_SHARD_ID ? { unitShardId: process.env.UNIT_SHARD_ID } : {}),
    },
  };
  summary.digest = digest(summary);
  validateLaneSummary(summary);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index].replace(/^--/u, ''), process.argv[index + 1]);
  }
  const lane = args.get('lane');
  if (!lane) throw new Error('--lane is required');
  const reportsDir = path.resolve(args.get('reports') ?? 'reports/test-system-v2');
  const inputPath = path.resolve(
    args.get('input') ?? `reports/ci-cd-platform/${lane}-input-v1.json`,
  );
  const output = path.resolve(
    args.get('output') ?? `reports/ci-cd-platform/${lane}-summary-v1.json`,
  );
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  let receipt = null;
  try {
    receipt = JSON.parse(
      await readFile(
        path.resolve(args.get('receipt') ?? 'reports/ci-cd-platform/workspace-receipt.json'),
        'utf8',
      ),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const summary = await observeLane({ lane, input, reportsDir, receipt, output });
  console.log(JSON.stringify({ path: output, status: summary.status, lane }, null, 2));
  if (summary.status !== 'success') process.exitCode = 1;
}
