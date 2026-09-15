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
  resolve: { alias: createPackageResolveAliases('relation') },
  test: {
    name: 'relation-integration',
    ...createVitestReportConfig(__dirname, 'relation-integration'),
    root: __dirname,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.spec.ts'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    testTimeout: 30000,
    passWithNoTests: false,
    env: createIntegrationTestEnv(),
    globalSetup: [path.resolve(__dirname, '../test-utils/src/setup/integration-global-setup.ts')],
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
