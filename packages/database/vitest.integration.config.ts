import { defineConfig } from 'vitest/config';
import { createVitestReportConfig } from '../../vitest.shared';

export default defineConfig({
  test: {
    name: 'database-integration',
    ...createVitestReportConfig(import.meta.dirname, 'database-integration'),
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    env: {
      NODE_ENV: 'test',
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test',
    },
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
