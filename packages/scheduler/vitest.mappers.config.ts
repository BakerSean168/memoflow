/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createSharedConfig, createSliceCoverage } from '../../vitest.shared';

const baseConfig = createSharedConfig({
  projectRoot: __dirname,
  reportName: 'scheduler-mappers',
  environment: 'node',
  testInclude: [
    'src/server/infrastructure/adapters/prisma/mappers/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  ],
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'scheduler-mappers',
      root: __dirname,
      coverage: createSliceCoverage({
        projectRoot: __dirname,
        roots: ['src/server/infrastructure/adapters/prisma/mappers'],
        reportsDirectory:
          'coverage/packages/scheduler/server-infrastructure-adapters-prisma-mappers',
        thresholds: {
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
      }),
    },
  }),
);
