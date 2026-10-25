#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStorybookProcess } from './storybook-process.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Preserve the existing CI artifact contract when replacing the Jest runner.
const results = path.join(root, 'test-results', 'storybook-results.json');
const nodeVitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');

if (!existsSync(nodeVitest)) {
  throw new Error('Vitest is not installed in the MemoFlow workspace.');
}

const isWSL = process.platform === 'linux' && /microsoft/i.test(os.release());
const isolation = process.env.MEMOFLOW_STORYBOOK_NETNS ?? 'auto';
if (!['auto', 'on', 'off'].includes(isolation)) {
  throw new Error('MEMOFLOW_STORYBOOK_NETNS must be auto, on, or off.');
}
const useNetworkNamespace = isolation === 'on' || (isolation === 'auto' && isWSL);

mkdirSync(path.dirname(results), { recursive: true });
rmSync(results, { force: true });

const vitestArgs = [
  nodeVitest,
  'run',
  '--config',
  'apps/storybook/vitest.config.ts',
  '--project=storybook',
  '--reporter=default',
  '--reporter=json',
  '--outputFile.json=' + results,
];
const command = useNetworkNamespace ? 'unshare' : process.execPath;
const args = useNetworkNamespace
  ? [
      '-Urn',
      '--',
      'sh',
      '-c',
      'ip link set lo up && exec "$@"',
      'storybook-browser',
      process.execPath,
      ...vitestArgs,
    ]
  : vitestArgs;

console.log(
  '[Storybook Browser] Vitest + Playwright Chromium; ' +
    (useNetworkNamespace ? 'WSL user/network namespace (loopback only)' : 'host network') +
    '; 4 suites / 17 interactions required.',
);
if (useNetworkNamespace) {
  console.log(
    '[Storybook Browser] Loopback only: external APIs, DNS and online assets are unavailable. Set MEMOFLOW_STORYBOOK_NETNS=off to use host networking.',
  );
}

const { done } = startStorybookProcess(command, args, {
  cwd: root,
  env: { ...process.env, CI: '1', STORYBOOK_DISABLE_TELEMETRY: '1' },
  stdio: 'inherit',
});
let exit;
try {
  exit = await done;
} catch (error) {
  console.error('[Storybook Browser] Cannot start test process:', error.message);
  process.exit(1);
}
if (exit !== 0) {
  console.error(
    '[Storybook Browser] Test command failed (exit ' +
      exit +
      '). On WSL, network isolation requires unprivileged user namespaces; ' +
      'run MEMOFLOW_STORYBOOK_NETNS=off only to diagnose host networking.',
  );
  process.exit(exit);
}

const report = JSON.parse(readFileSync(results, 'utf8'));
assert.equal(report.success, true, 'Vitest JSON report must succeed');
assert.equal(report.numPassedTestSuites, 4, 'Four audited Story files are required');
assert.equal(report.numTotalTests, 17, 'Do not silently lose audited Story interactions');
assert.equal(report.numPassedTests, 17, 'All seventeen interactions must pass');
assert.equal(report.numFailedTests, 0, 'No failing tests allowed');
assert.equal(report.numPendingTests, 0, 'Do not silently skip Story interactions');
assert.equal(report.numTodoTests, 0, 'Do not accept todo tests as passing');
const ids = report.testResults.flatMap((file) =>
  file.assertionResults.map((test) => test.meta?.storyId),
);
assert.equal(ids.length, 17);
assert.equal(new Set(ids).size, 17, 'Story IDs must be unique');
assert.ok(ids.every(Boolean), 'Storybook addon must link every result to a Story ID');
console.log(
  '[Storybook Browser] PASS: 4/4 Story files, 17/17 interactions, no skipped or todo tests.',
);
