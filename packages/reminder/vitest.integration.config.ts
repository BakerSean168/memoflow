/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import {
  contractsDeepImportResolver,
  createPackageResolveAliases,
  domainResolveAtAlias,
} from '../../vitest.workspace-helpers';
import { createIntegrationTestEnv } from '../test-utils/src/setup/database';
import { createVitestReportConfig } from '../../vitest.shared.ts';

export default defineConfig({
  plugins: [contractsDeepImportResolver, domainResolveAtAlias],
  resolve: {
    alias: createPackageResolveAliases('reminder'),
  },
  test: {
    name: 'reminder-integration',
    ...createVitestReportConfig(import.meta.dirname, 'reminder-integration'),
    root: import.meta.dirname,
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.integration.test.ts',
      'src/**/*.integration.spec.ts',
      'src/**/*.integration.test.js',
      'src/**/*.integration.spec.js',
    ],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    testTimeout: 30000,
    passWithNoTests: false,
    env: createIntegrationTestEnv(),
    globalSetup: [path.resolve(import.meta.dirname, '../test-utils/src/setup/integration-global-setup.ts')], // Residual 1037 sole
    fileParallelism: false,
    sequence: {
      groupOrder: 1,
    },
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
