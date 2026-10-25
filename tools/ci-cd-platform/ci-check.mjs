#!/usr/bin/env node
/**
 * Usage (ci.yml `CI Check` job):
 *   CI_CHECK_NEEDS='${{ toJSON(needs) }}' node tools/ci-cd-platform/ci-check.mjs --manifest scope/delivery-manifest-v1.json
 * A missing or unreadable manifest fails the gate.
 */
import { readFile, appendFile, readdir } from 'node:fs/promises';
import { evaluateCiCheck, validWebReceiptArtifactPath } from './lib/ci-check.mjs';

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

let webReceipts = [];
try {
  const files = await readdir('reports/web-shards', { recursive: true });
  webReceipts = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        const receipt = JSON.parse(await readFile(`reports/web-shards/${file}`, 'utf8'));
        if (!validWebReceiptArtifactPath(file, receipt)) {
          throw new Error(`Web receipt path conflicts with attempt/shard identity: ${file}`);
        }
        return receipt;
      }),
  );
} catch (error) {
  if (error.code !== 'ENOENT') webReceipts = null;
}
// Merged coverage: the Unit shard reports are the coverage evidence of
// record. Read them when the manifest selected the coverage lane; a
// missing or unreadable evidence tree fails the gate closed (null).
let coverageReports = undefined;
if (manifest?.lanes?.coverage === true) {
  coverageReports = null;
  try {
    const files = await readdir('reports/unit-evidence', { recursive: true });
    const parsed = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
          try {
            return JSON.parse(await readFile(`reports/unit-evidence/${file}`, 'utf8'));
          } catch {
            return null;
          }
        }),
    );
    coverageReports = parsed.filter(
      (value) => value && value.version === 1 && Array.isArray(value.attempts),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') coverageReports = null;
  }
}
const capabilityResults = {};
if (manifest?.laneDetails?.componentBrowser) {
  // Q4: Component Browser is an independent job (producer of record).
  capabilityResults.componentBrowser = needs?.['component-browser']?.result ?? 'missing';
}
if (manifest?.laneDetails?.contract) {
  capabilityResults.contract = needs?.['contract']?.result ?? 'missing';
}
if (manifest?.laneDetails?.fmt) {
  // Fmt shares the lightweight Static Checks runner (governance job).
  capabilityResults.fmt = needs?.['governance']?.result ?? 'missing';
}
const result = evaluateCiCheck({
  needs,
  manifest,
  webReceipts,
  capabilityResults,
  coverageReports,
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
