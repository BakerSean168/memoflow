/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createSharedConfig, createSliceCoverage } from '../../vitest.shared.ts';

const baseConfig = createSharedConfig({
  projectRoot: import.meta.dirname,
  reportName: 'goal-use-cases',
  environment: 'node',
  testInclude: [
    'src/server/application/use-cases/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  ],
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'goal-use-cases',
      root: import.meta.dirname,
      coverage: createSliceCoverage({
        projectRoot: import.meta.dirname,
        roots: ['src/server/application/use-cases'],
        reportsDirectory: 'coverage/packages/goal/server-application-use-cases',
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
