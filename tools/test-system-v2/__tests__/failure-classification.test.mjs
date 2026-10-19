import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyFailure } from '../lib/failure-classification.mjs';

test('classifies assertion, infrastructure, crash, timeout, and flaky outcomes', () => {
  assert.equal(classifyFailure({ output: 'AssertionError' }), 'assertion');
  assert.equal(classifyFailure({ output: 'spawn pnpm ENOENT' }), 'infrastructure');
  assert.equal(classifyFailure({ signal: 'SIGSEGV' }), 'process-crash');
  assert.equal(classifyFailure({ timedOut: true }), 'timeout');
  assert.equal(classifyFailure({ output: 'known flaky test' }), 'flaky');
});

const triggerOutput = [
  'startup',
  'spawn',
  'ENOENT',
  'ECONNREFUSED',
  'failed to connect',
  'docker daemon',
  'cannot find module',
  'SIGSEGV',
  'SIGABRT',
  'SIGBUS',
  'segmentation fault',
  'native crash',
  'flaky',
  'unstable',
  'flake',
];

for (const output of triggerOutput) {
  test(`successful process ignores test scenario output: ${output}`, () => {
    assert.equal(classifyFailure({ exitCode: 0, output }), 'success');
  });
}

test('process evidence takes precedence over exit code and descriptive output', () => {
  assert.equal(classifyFailure({ exitCode: 0, signal: 'SIGTERM' }), 'process-crash');
  assert.equal(classifyFailure({ exitCode: 0, timedOut: true, signal: 'SIGTERM' }), 'timeout');
  assert.equal(classifyFailure({ exitCode: 0, spawnError: { code: 'EACCES' } }), 'infrastructure');
  assert.equal(classifyFailure({ exitCode: null }), 'assertion');
  assert.equal(classifyFailure({ exitCode: 17, output: 'ECONNREFUSED' }), 'infrastructure');
  assert.equal(classifyFailure({ exitCode: 17, output: 'SIGSEGV' }), 'process-crash');
});

function runCommand(t, args, env = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'memoflow-command-outcome-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    ['tools/test-system-v2/run-command.mjs', '--', ...args],
    {
      env: {
        ...process.env,
        DELIVERY_LANE: '',
        DELIVERY_MANIFEST_PATH: '',
        LANE_INPUT_PATH: '',
        TEST_REPORTS_DIR: root,
        TEST_REPORT_NAME: 'outcome',
        TEST_RETRY_INFRASTRUCTURE: 'true',
        GITHUB_STEP_SUMMARY: '',
        ...env,
      },
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  assert.equal(result.error, undefined);
  const report = JSON.parse(readFileSync(path.join(root, 'outcome.json'), 'utf8'));
  return { result, report, root };
}

for (const output of triggerOutput) {
  test(`runner executes successful ${output} output exactly once`, (t) => {
    const { result, report } = runCommand(t, [
      process.execPath,
      '-e',
      `console.log(${JSON.stringify(output)})`,
    ]);
    assert.equal(result.status, 0);
    assert.equal(report.result, 'success');
    assert.equal(report.flaky, false);
    assert.equal(report.attempts.length, 1);
    assert.equal(report.attempts[0].classification, 'success');
    assert.equal(result.stdout.split(output).length - 1, 1);
  });
}

for (const [script, classification, count, status] of [
  ["console.error('ECONNREFUSED'); process.exit(17)", 'infrastructure', 2, 17],
  ["console.error('AssertionError'); process.exit(17)", 'assertion', 1, 17],
  ["console.error('known flaky test'); process.exit(17)", 'flaky', 1, 17],
  ["process.kill(process.pid, 'SIGTERM')", 'process-crash', 2, 1],
]) {
  test(`runner preserves failed ${classification} evidence and bounded attempts`, (t) => {
    const { result, report } = runCommand(t, [process.execPath, '-e', script]);
    assert.equal(result.status, status);
    assert.equal(report.result, 'failure');
    assert.equal(report.attempts.length, count);
    assert.ok(report.attempts.every((attempt) => attempt.classification === classification));
    if (classification === 'process-crash') {
      assert.equal(report.attempts[0].signal, 'SIGTERM');
      assert.equal(report.attempts[0].exitCode, null);
    }
  });
}

test('runner classifies actual spawn errors without relying on output', (t) => {
  const { result, report } = runCommand(t, ['/memoflow-nonexistent-command-519']);
  assert.equal(result.status, 1);
  assert.equal(report.result, 'failure');
  assert.equal(report.attempts.length, 2);
  assert.ok(report.attempts.every((attempt) => attempt.classification === 'infrastructure'));
  assert.equal(report.attempts[0].spawnError.code, 'ENOENT');
});

test('runner respects explicit no-retry policy for failed infrastructure', (t) => {
  const { result, report } = runCommand(
    t,
    [process.execPath, '-e', "console.error('ECONNREFUSED'); process.exit(17)"],
    { TEST_RETRY_INFRASTRUCTURE: 'false' },
  );
  assert.equal(result.status, 17);
  assert.equal(report.attempts.length, 1);
  assert.equal(report.attempts[0].classification, 'infrastructure');
});

test('runner retains first failure when infrastructure recovers on its one retry', (t) => {
  const script = `
    const fs = require('node:fs');
    const marker = require('node:path').join(process.env.TEST_REPORTS_DIR, 'calls');
    const count = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) + 1 : 1;
    fs.writeFileSync(marker, String(count));
    console.log('ECONNREFUSED');
    process.exit(count === 1 ? 17 : 0);
  `;
  const { result, report, root } = runCommand(t, [process.execPath, '-e', script]);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(path.join(root, 'calls'), 'utf8'), '2');
  assert.equal(report.result, 'success');
  assert.equal(report.flaky, true);
  assert.deepEqual(
    report.attempts.map(({ classification, exitCode }) => ({ classification, exitCode })),
    [
      { classification: 'infrastructure', exitCode: 17 },
      { classification: 'success', exitCode: 0 },
    ],
  );
  const totalSeconds = (
    report.attempts.reduce((total, attempt) => total + attempt.durationMs, 0) / 1000
  ).toFixed(3);
  const junit = readFileSync(path.join(root, 'outcome.junit.xml'), 'utf8');
  assert.ok(junit.includes(`time="${totalSeconds}"`));
  assert.ok(junit.includes('failures="0"'));
});
