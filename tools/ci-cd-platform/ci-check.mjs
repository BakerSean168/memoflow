#!/usr/bin/env node
/**
 * Usage (ci.yml `CI Check` job):
 *   CI_CHECK_NEEDS='${{ toJSON(needs) }}' node tools/ci-cd-platform/ci-check.mjs --manifest scope/delivery-manifest-v1.json
 * A missing or unreadable manifest fails the gate.
 */
import { readFile, appendFile, readdir } from 'node:fs/promises';
import { evaluateCiCheck } from './lib/ci-check.mjs';

const manifestFlag = process.argv.indexOf('--manifest');
const manifestPath =
  manifestFlag >= 0 ? process.argv[manifestFlag + 1] : 'scope/delivery-manifest-v1.json';

let needs = null;
try {
  needs = JSON.parse(process.env.CI_CHECK_NEEDS ?? 'null');
} catch {
  needs = null;
}
let manifest = null;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  manifest = null;
}

let taskReceipts = [];
try {
  const files = await readdir('reports/ci-tasks', { recursive: true });
  taskReceipts = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => JSON.parse(await readFile(`reports/ci-tasks/${file}`, 'utf8'))),
  );
} catch (error) {
  if (error.code !== 'ENOENT') taskReceipts = null;
}
const result = evaluateCiCheck({
  needs,
  manifest,
  taskReceipts,
  commit: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
});
console.log(JSON.stringify(result, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(result.jobs).map(
    ([name, { expected, actual }]) =>
      `| ${name} | ${expected} | ${actual} | ${expected === actual ? 'ok' : 'FAIL'} |`,
  );
  const summary = [
    `## CI Check: ${result.state}`,
    '',
    '| job | expected | actual | |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    ...result.failures.map((failure) => `- ${failure}`),
    '',
  ].join('\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (result.state !== 'success') process.exitCode = 1;
