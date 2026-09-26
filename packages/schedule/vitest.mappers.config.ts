/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createSharedConfig, createSliceCoverage } from '../../vitest.shared.ts';

const baseConfig = createSharedConfig({
  projectRoot: import.meta.dirname,
  reportName: 'schedule-mappers',
  environment: 'node',
  testInclude: [
    'src/server/infrastructure/adapters/prisma/mappers/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  ],
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'schedule-mappers',
      root: import.meta.dirname,
      coverage: createSliceCoverage({
        projectRoot: import.meta.dirname,
        roots: ['src/server/infrastructure/adapters/prisma/mappers'],
        reportsDirectory:
          'coverage/packages/schedule/server-infrastructure-adapters-prisma-mappers',
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
