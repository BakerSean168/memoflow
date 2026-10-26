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
    aliasEntries: [
      ...createUiVueSourceAliasEntries(workspaceRoot),
      {
        find: /^@schedule-ui-test-host\/(.+)$/,
        replacement: path.resolve(workspaceRoot, 'packages/app-vue/src/$1'),
      },
    ],
    // The test host resolves @schedule-ui-test-host/* into app-vue source, which
    // imports the Goal client. app-vue's own vitest config aliases it to source
    // for the same reason: the published entry is an unbuilt dist in test jobs.
    aliases: {
      '@memoflow/goal-client': '../../packages/goal-client/src/index.ts',
    },
  }),
  defineConfig({
    root: import.meta.dirname,
    plugins: [vue()],
    test: {
      name: 'schedule-ui',
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
