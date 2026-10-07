import { defineConfig } from 'vitest/config';
import { createVitestReportConfig } from '../../vitest.shared';
import { createIntegrationTestEnv } from '../test-utils/src/setup/database';

export default defineConfig({
  test: {
    name: 'database-integration',
    ...createVitestReportConfig(import.meta.dirname, 'database-integration'),
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    env: createIntegrationTestEnv(),
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
