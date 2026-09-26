import vue from '@vitejs/plugin-vue';
import { defineConfig, mergeConfig } from 'vitest/config';
import path from 'node:path';
import { createSharedConfig } from '../../vitest.shared.ts';
import { createUiVueSourceAliasEntries } from '../../vite.workspace-aliases.ts';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

export default mergeConfig(
  createSharedConfig({
    projectRoot: import.meta.dirname,
    environment: 'happy-dom',
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
      name: 'app-vue',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
      execArgv: [
        // Node >= 22 exposes a globalThis.localStorage that is unusable without
        // --localstorage-file and emits a per-worker ExperimentalWarning whenever
        // the happy-dom environment touches it. The shared setup installs a
        // functional Storage; this flag silences that noise.
        '--disable-warning=ExperimentalWarning',
      ],
    },
  }),
);
