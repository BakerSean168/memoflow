#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { classifyFailure } from './lib/failure-classification.mjs';
import { collectTestReportSummaries } from './lib/test-report-summary.mjs';
// The execution adapter is the single intentional consumer of the versioned CI/CD contracts.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  digest,
  validateDeliveryManifest,
  validateLaneInput,
} from '../ci-cd-platform/lib/contracts.mjs';

// eslint-disable-next-line @nx/enforce-module-boundaries
import { projectCommand } from '../ci-cd-platform/lib/project-command.mjs';

const separator = process.argv.indexOf('--');
if (separator < 0 || separator === process.argv.length - 1) {
  console.error('Usage: node run-command.mjs -- <command> [...args]');
  process.exit(2);
}
const [requestedCommand, ...requestedArgs] = process.argv.slice(separator + 1);
const reportName = process.env.TEST_REPORT_NAME ?? 'command';
const reportsDir = process.env.TEST_REPORTS_DIR ?? 'reports/test-system-v2';
const bootstrap = path.resolve('tools/ci/node-process-bootstrap.cjs');

async function readLaneContext() {
  if (!process.env.DELIVERY_LANE || !process.env.DELIVERY_MANIFEST_PATH) return null;
  const manifest = JSON.parse(
    await readFile(path.resolve(process.env.DELIVERY_MANIFEST_PATH), 'utf8'),
  );
  validateDeliveryManifest(manifest);
  const laneInputPath = process.env.LANE_INPUT_PATH;
  if (!laneInputPath) {
    throw new Error(`Missing LANE_INPUT_PATH for delivery lane ${process.env.DELIVERY_LANE}`);
  }
  const laneInput = JSON.parse(await readFile(path.resolve(laneInputPath), 'utf8'));
  validateLaneInput(laneInput);
  if (
    laneInput.lane !== process.env.DELIVERY_LANE ||
    laneInput.commit !== manifest.commit ||
    laneInput.manifestDigest !== manifest.digest
  ) {
    throw new Error(`Lane input provenance does not match delivery manifest for ${laneInput.lane}`);
  }
  return { manifest, laneInput, laneInputPath };
}

const laneContext = await readLaneContext();
const { command, args } = projectCommand(
  requestedCommand,
  requestedArgs,
  laneContext?.manifest.full === true,
);

async function run(attempt) {
  const startedAt = new Date();
  const chunks = [];
  const result = await new Promise((resolve) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...(laneContext?.manifest.base ? { NX_BASE: laneContext.manifest.base } : {}),
        ...(laneContext?.manifest.head ? { NX_HEAD: laneContext.manifest.head } : {}),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${bootstrap}`.trim(),
      },
      shell: process.platform === 'win32',
    });
    child.stdout?.on('data', (chunk) => {
      chunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      chunks.push(chunk);
      process.stderr.write(chunk);
    });
    let spawnError = null;
    child.on('error', (error) => {
      spawnError = { code: error.code ?? null, message: error.message };
    });
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal, spawnError }));
  });
  const output = Buffer.concat(chunks).toString('utf8');
  return {
    attempt,
    command: [command, ...args],
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    exitCode: result.exitCode,
    signal: result.signal,
    spawnError: result.spawnError,
    classification: classifyFailure({ ...result, output }),
  };
}

const attempts = [await run(1)];
if (
  (attempts[0].exitCode !== 0 || attempts[0].signal || attempts[0].spawnError) &&
  process.env.TEST_RETRY_INFRASTRUCTURE !== 'false' &&
  ['infrastructure', 'process-crash'].includes(attempts[0].classification)
)
  attempts.push(await run(2));
const final = attempts.at(-1);
const succeeded = final.classification === 'success';
const executionMs = attempts.reduce((total, attempt) => total + attempt.durationMs, 0);
const testSummary = await collectTestReportSummaries(
  process.cwd(),
  Date.parse(attempts[0].startedAt),
);
const report = {
  version: 1,
  name: reportName,
  lane: process.env.DELIVERY_LANE ?? null,
  flaky: attempts.length > 1 && succeeded,
  attempts,
  result: succeeded ? 'success' : 'failure',
  testSummary,
  provenance: {
    runner: process.env.RUNNER_OS ?? process.platform,
    job: process.env.GITHUB_JOB ?? null,
    ...(process.env.UNIT_SHARD_ID ? { unitShardId: process.env.UNIT_SHARD_ID } : {}),
  },
};
await mkdir(reportsDir, { recursive: true });
await writeFile(
  path.join(reportsDir, `${reportName}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
const escapedName = reportName
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('"', '&quot;');
const junit = `<testsuite name="${escapedName}" tests="1" failures="${succeeded ? 0 : 1}" time="${(executionMs / 1000).toFixed(3)}"><testcase classname="${escapedName}" name="command" time="${(executionMs / 1000).toFixed(3)}">${succeeded ? '' : `<failure type="${final.classification}"/>`}</testcase></testsuite>`;
await writeFile(path.join(reportsDir, `${reportName}.junit.xml`), `${junit}\n`);
if (laneContext) {
  const { manifest, laneInput, laneInputPath } = laneContext;
  const laneResult = {
    kind: 'lane-result-v1',
    version: 1,
    lane: process.env.DELIVERY_LANE,
    commit: manifest.commit,
    manifestDigest: manifest.digest,
    laneInputDigest: laneInput.digest,
    status: succeeded ? 'success' : 'failure',
    failure: {
      classification: succeeded ? 'none' : final.classification,
      attempts: attempts.length,
      retried: attempts.length > 1,
    },
    timing: {
      executionMs,
      attempts: attempts.map(({ attempt, durationMs, classification }) => ({
        attempt,
        durationMs,
        classification,
      })),
    },
    tests: testSummary,
    provenance: {
      report: path.join(reportsDir, `${reportName}.json`),
      runner: process.env.RUNNER_OS ?? process.platform,
      laneInput: laneInputPath,
      job: process.env.GITHUB_JOB ?? null,
      ...(process.env.UNIT_SHARD_ID ? { unitShardId: process.env.UNIT_SHARD_ID } : {}),
    },
  };
  laneResult.digest = digest(laneResult);
  await writeFile(
    path.join(reportsDir, `${process.env.DELIVERY_LANE}.${reportName}.lane-result.json`),
    `${JSON.stringify(laneResult, null, 2)}\n`,
  );
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const slowest = testSummary.slowestTests
    .slice(0, 5)
    .map(
      (entry) =>
        `| ${String(entry.name).replaceAll('|', '\\|')} | ${entry.durationMs.toFixed(1)} ms |`,
    )
    .join('\n');
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### ${reportName}`,
      '',
      `- Result: **${report.result}** (${final.classification})`,
      `- Attempts: ${attempts.length}; duration: ${executionMs} ms`,
      `- Test files: ${testSummary.files.total}; tests: ${testSummary.tests.total}; skipped: ${testSummary.tests.skipped}; retries: ${testSummary.tests.retries}`,
      ...(slowest ? ['', '| Slowest test | Duration |', '| --- | ---: |', slowest] : []),
      '',
    ].join('\n'),
  );
}
console.log(
  `[test-system-v2] ${reportName}: ${report.result}; ${final.classification}; ${executionMs}ms`,
);
process.exitCode = succeeded ? 0 : final.exitCode > 0 ? final.exitCode : 1;
