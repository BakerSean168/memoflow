/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createSharedConfig, createSliceCoverage } from '../../vitest.shared';

const baseConfig = createSharedConfig({
  projectRoot: __dirname,
  reportName: 'scheduler-use-cases',
  environment: 'node',
  testInclude: [
    'src/server/application/use-cases/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  ],
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'scheduler-use-cases',
      root: __dirname,
      coverage: createSliceCoverage({
        projectRoot: __dirname,
        roots: ['src/server/application/use-cases'],
        reportsDirectory: 'coverage/packages/scheduler/server-application-use-cases',
        thresholds: {
          statements: 70,
          lines: 70,
          functions: 70,
          branches: 60,
        },
      }),
    },
  }),
);
