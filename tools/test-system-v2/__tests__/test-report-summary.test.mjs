import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  aggregateTestSummaries,
  summarizePlaywrightReport,
  summarizeVitestReport,
} from '../lib/test-report-summary.mjs';

test('summarizes Vitest counts, retries and slowest tests', () => {
  const summary = summarizeVitestReport({
    numTotalTests: 3,
    numPassedTests: 1,
    numFailedTests: 1,
    numPendingTests: 1,
    numTodoTests: 0,
    testResults: [
      {
        name: 'a.test.ts',
        status: 'failed',
        startTime: 10,
        endTime: 40,
        assertionResults: [
          { fullName: 'slow', duration: 20, status: 'failed', retryCount: 1 },
          { fullName: 'fast', duration: 2, status: 'passed' },
        ],
      },
      {
        name: 'b.test.ts',
        status: 'pending',
        startTime: 10,
        endTime: 15,
        assertionResults: [],
      },
    ],
  });
  assert.deepEqual(summary.files, { total: 2, passed: 0, failed: 1, skipped: 1 });
  assert.deepEqual(summary.tests, { total: 3, passed: 1, failed: 1, skipped: 1, retries: 1 });
  assert.equal(summary.slowestTests[0].name, 'slow');
});

test('reports Playwright flaky outcomes as failures and retains retry evidence', () => {
  const summary = summarizePlaywrightReport({
    config: {},
    suites: [
      {
        specs: [
          {
            file: 'flow.spec.ts',
            title: 'works',
            tests: [
              { status: 'expected', results: [{ status: 'passed', retry: 0, duration: 3 }] },
              {
                status: 'flaky',
                results: [
                  { status: 'failed', retry: 0, duration: 5 },
                  { status: 'passed', retry: 1, duration: 9 },
                ],
              },
            ],
          },
          {
            file: 'skip.spec.ts',
            title: 'skips',
            tests: [{ status: 'skipped', results: [] }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(summary.files, { total: 2, passed: 0, failed: 1, skipped: 1 });
  assert.deepEqual(summary.tests, { total: 3, passed: 1, failed: 1, skipped: 1, retries: 1 });
  assert.equal(summary.slowestTests[0].status, 'flaky');
  assert.equal(aggregateTestSummaries([summary]).tests.failed, 1);
  assert.equal(summary.slowestTests[0].durationMs, 9);
});

test('aggregates framework reports without losing slowest evidence', () => {
  const vitest = summarizeVitestReport({
    numTotalTests: 1,
    numPassedTests: 1,
    testResults: [
      {
        name: 'unit.test.ts',
        status: 'passed',
        startTime: 0,
        endTime: 12,
        assertionResults: [{ fullName: 'unit', duration: 10, status: 'passed' }],
      },
    ],
  });
  const total = aggregateTestSummaries([vitest]);
  assert.equal(total.reportCount, 1);
  assert.equal(total.tests.total, 1);
  assert.equal(total.slowestSpecs[0].name, 'unit.test.ts');
});

for (const ci of ['', 'true']) {
  test(`AI workspace config disables retries and rejects CI flaky outcomes (CI=${ci})`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import config from './apps/web/playwright.config.ts';
         console.log(JSON.stringify({ retries: config.retries, failOnFlakyTests: config.failOnFlakyTests }));`,
      ],
      {
        env: { ...process.env, CI: ci, WEB_E2E_MODE: 'workspace' },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), {
      retries: 0,
      failOnFlakyTests: Boolean(ci),
    });
  });
}
