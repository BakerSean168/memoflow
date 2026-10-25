import { defineConfig, mergeConfig } from 'vitest/config';
import { createSliceCoverage } from '../../vitest.shared.ts';
import unitConfig from './vitest.config';

// Collect stores coverage while executing the complete Unit suite. This target
// replaces test in Full Audit, so narrowing test.include would silently drop UI tests.
export default mergeConfig(
  unitConfig,
  defineConfig({
    root: import.meta.dirname,
    test: {
      name: 'app-vue-store-coverage',
      coverage: createSliceCoverage({
        projectRoot: import.meta.dirname,
        roots: ['src/modules'],
        reportsDirectory: 'coverage/packages/app-vue/stores',
        fileIncludePattern: /^src\/modules\/.+\/stores\/[^/]+\.ts$/,
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
