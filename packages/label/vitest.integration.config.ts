/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import {
  contractsDeepImportResolver,
  createPackageResolveAliases,
  domainResolveAtAlias,
} from '../../vitest.workspace-helpers'
import { createIntegrationTestEnv } from '../test-utils/src/setup/database'
import { createVitestReportConfig } from '../../vitest.shared.ts'

export default defineConfig({
  plugins: [contractsDeepImportResolver, domainResolveAtAlias],
  resolve: { alias: createPackageResolveAliases('label') },
  test: {
    name: 'label-integration',
    ...createVitestReportConfig(import.meta.dirname, 'label-integration'),
    root: import.meta.dirname,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.spec.ts'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    testTimeout: 30000,
    passWithNoTests: false,
    env: createIntegrationTestEnv(),
    globalSetup: [path.resolve(import.meta.dirname, '../test-utils/src/setup/integration-global-setup.ts')],
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
})
