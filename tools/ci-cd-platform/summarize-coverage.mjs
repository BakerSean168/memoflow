#!/usr/bin/env node
/**
 * Usage (ci.yml `Delivery Observation` job, before observe-run):
 *   node tools/ci-cd-platform/summarize-coverage.mjs \
 *     --manifest scope/delivery-manifest-v1.json \
 *     --evidence reports/run-evidence \
 *     --output reports/run-evidence/coverage-summary-v1.json
 *
 * Coverage no longer executes inside Verification Children: the Unit
 * shards run `test:coverage` for the manifest's coverage projects. This
 * collector scans the downloaded run evidence for the Unit shard reports,
 * verifies per-project coverage attempts with the same evaluator the CI
 * Check gate uses, and emits the coverage lane summary so the run summary
 * keeps an honest per-lane account. The summary carries the failure when
 * coverage evidence is incomplete; observe-run and CI Check enforce it.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildLaneInput, digest, validateLaneSummary } from './lib/contracts.mjs';
import { evaluateCoverageEvidence } from './lib/coverage-evidence.mjs';
import { getLaneDefinition } from './lib/registry.mjs';
import { UNIT_JOB_IDS } from './lib/unit-shards.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/u, ''), process.argv[index + 1]);
}
const manifestPath = path.resolve(args.get('manifest') ?? 'scope/delivery-manifest-v1.json');
const evidenceDir = path.resolve(args.get('evidence') ?? 'reports/run-evidence');
const output = path.resolve(args.get('output') ?? 'reports/run-evidence/coverage-summary-v1.json');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.lanes?.coverage !== true) {
  console.log(JSON.stringify({ lane: 'coverage', skipped: 'lane not selected by manifest' }));
  process.exit(0);
}

async function readJsonFiles(directory) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await readJsonFiles(file)));
    else if (entry.name.endsWith('.json')) files.push(file);
  }
  return files;
}

const reports = [];
for (const file of await readJsonFiles(evidenceDir)) {
  let value;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    continue;
  }
  if (
    value &&
    value.version === 1 &&
    Array.isArray(value.attempts) &&
    UNIT_JOB_IDS.includes(value.provenance?.unitShardId)
  ) {
    reports.push({ file, value });
  }
}

const evaluation = evaluateCoverageEvidence({
  manifest,
  reports: reports.map(({ value }) => value),
});
const matchedFiles = evaluation.reports.map(
  (report) => reports.find(({ value }) => value === report)?.file ?? report.name,
);
const testSummaries = evaluation.reports.map((report) => report.testSummary).filter(Boolean);
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

const definition = getLaneDefinition('coverage');
const laneInput = buildLaneInput({
  lane: 'coverage',
  commit: manifest.commit,
  manifestDigest: manifest.digest,
  definition,
  scope: manifest.scope,
  risk: manifest.risk,
  runId: process.env.GITHUB_RUN_ID ?? null,
  policy: {
    event: manifest.event,
    risk: manifest.risk.level,
    full: manifest.full,
    execution: 'verification',
  },
});
const failures = evaluation.failures.map((failure) => ({
  report: failure,
  classification: failure.endsWith(':attempt-failed') ? 'assertion' : 'infrastructure',
}));
const summary = {
  kind: 'lane-summary-v1',
  version: 1,
  lane: 'coverage',
  commit: manifest.commit,
  manifestDigest: manifest.digest,
  laneInputDigest: digest(laneInput),
  status: failures.length === 0 ? 'success' : 'failure',
  owner: definition.owner,
  timing: {
    setupMs: null,
    commandCount: evaluation.reports.length,
    attemptCount: evaluation.attemptCount,
    executionMs: evaluation.executionMs,
    longestCommandMs: evaluation.longestCommandMs,
  },
  failures,
  tests: testTotals,
  cache: null,
  toolchain: null,
  evidence: { reports: matchedFiles, laneResults: [] },
  provenance: {
    generator: 'ci-cd-platform-v2/summarize-coverage@1',
    runner: process.env.RUNNER_OS ?? process.platform,
    runId: process.env.GITHUB_RUN_ID ?? null,
    job: process.env.GITHUB_JOB ?? null,
  },
};
summary.digest = digest(summary);
validateLaneSummary(summary);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ path: output, status: summary.status, lane: 'coverage' }, null, 2));
