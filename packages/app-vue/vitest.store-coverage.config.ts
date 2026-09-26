import vue from '@vitejs/plugin-vue';
import { defineConfig, mergeConfig } from 'vitest/config';
import path from 'node:path';
import { createSharedConfig, createSliceCoverage } from '../../vitest.shared.ts';
import { createUiVueSourceAliasEntries } from '../../vite.workspace-aliases.ts';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

export default mergeConfig(
  createSharedConfig({
    projectRoot: import.meta.dirname,
    environment: 'happy-dom',
    testInclude: ['src/modules/**/stores/**/*.{test,spec}.{ts,tsx}'],
    aliasEntries: createUiVueSourceAliasEntries(workspaceRoot),
    aliases: {
      '@memoflow/http-client': '../../packages/http-client/src/index.ts',
      '@memoflow/ai/client': '../../packages/ai/src/client/index.ts',
      '@memoflow/goal/client': '../../packages/goal/src/client/index.ts',
      '@memoflow/task/client': '../../packages/task/src/client/index.ts',
      '@memoflow/repository/client': '../../packages/repository/src/client/index.ts',
    },
  }),
  defineConfig({
    root: import.meta.dirname,
    plugins: [vue()],
    test: {
      name: 'app-vue-store-coverage',
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
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
