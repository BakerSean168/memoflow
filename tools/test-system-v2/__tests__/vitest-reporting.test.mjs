import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const useCaseCoverageConfigs = ['task', 'goal', 'reminder'].flatMap((project) => [
  `packages/${project}/vitest.config.ts`,
  `packages/${project}/vitest.use-cases.config.ts`,
  `packages/${project}/vitest.mappers.config.ts`,
]);

const coverageConfigs = [
  ...useCaseCoverageConfigs,
  // S4-2302B retired Scheduler's legacy ScheduleTask use-case slice.
  'packages/scheduler/vitest.config.ts',
  'packages/scheduler/vitest.mappers.config.ts',
  'packages/schedule/vitest.config.ts',
  'packages/schedule/vitest.mappers.config.ts',
];

test('aggregate coverage configs emit distinct JSON and JUnit reports', () => {
  const script = `
    const configs = JSON.parse(process.env.VITEST_REPORT_CONFIGS);
    const reports = configs.map((file) => require('./' + file).default.test.outputFile);
    process.stdout.write(JSON.stringify(reports));
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
      TEST_REPORT_NAME: 'coverage',
      VITEST_REPORT_CONFIGS: JSON.stringify(coverageConfigs),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const reports = JSON.parse(result.stdout);
  assert.equal(reports.length, coverageConfigs.length);
  assert.equal(new Set(reports.map((report) => report.json)).size, coverageConfigs.length);
  assert.equal(new Set(reports.map((report) => report.junit)).size, coverageConfigs.length);
});
