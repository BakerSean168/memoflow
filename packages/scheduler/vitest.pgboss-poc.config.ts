/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import {
  contractsDeepImportResolver,
  createPackageResolveAliases,
  domainResolveAtAlias,
} from '../../vitest.workspace-helpers';
import { createIntegrationTestEnv } from '../test-utils/src/setup/database';
import { createVitestReportConfig } from '../../vitest.shared';

export default defineConfig({
  plugins: [contractsDeepImportResolver, domainResolveAtAlias],
  resolve: {
    alias: createPackageResolveAliases('scheduler'),
  },
  test: {
    name: 'scheduler-pgboss-poc',
    ...createVitestReportConfig(__dirname, 'scheduler-pgboss-poc'),
    root: __dirname,
    globals: true,
    environment: 'node',
    include: ['poc/pg-boss/pg-boss-scheduling.poc.ts'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    passWithNoTests: false,
    env: createIntegrationTestEnv(),
    globalSetup: [path.resolve(__dirname, '../test-utils/src/setup/integration-global-setup.ts')],
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
