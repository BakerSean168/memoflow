/// <reference types="vitest" />
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { createSharedConfig } from '../../vitest.shared';
import { createUiVueSourceAliasEntries } from '../../vite.workspace-aliases';

const workspaceRoot = path.resolve(__dirname, '../..');
const sharedConfig = createSharedConfig({
  projectRoot: __dirname,
  environment: 'happy-dom',
  aliasEntries: createUiVueSourceAliasEntries(workspaceRoot),
  aliases: {
    '@memoflow/app-vue': '../../packages/app-vue/src/index.ts',
    '@memoflow/app-vue/modules/authentication':
      '../../packages/app-vue/src/modules/authentication/index.ts',
    '@memoflow/app-vue/web-core': '../../packages/app-vue/src/web-core.ts',
    '@memoflow/app-vue/web-shell-core': '../../packages/app-vue/src/web-shell-core.ts',
    '@memoflow/app-vue/web-overlays': '../../packages/app-vue/src/web-overlays.ts',
    '@memoflow/app-vue/web-bootstrap': '../../packages/app-vue/src/web-bootstrap.ts',
    '@memoflow/cloud-auth': '../../packages/cloud-auth/src/index.ts',
    '@memoflow/app-vue/web-i18n': '../../packages/app-vue/src/web-i18n.ts',
    '@memoflow/schedule/client': '../../packages/schedule/src/client/index.ts',
    '@memoflow/notification/client': '../../packages/notification/src/client/index.ts',
    '@memoflow/reminder/client': '../../packages/reminder/src/client/index.ts',
    '@memoflow/ai/client': '../../packages/ai/src/client/index.ts',
    '@memoflow/goal/client': '../../packages/goal/src/client/index.ts',
    '@memoflow/repository/client': '../../packages/repository/src/client/index.ts',
    '@memoflow/task/client': '../../packages/task/src/client/index.ts',
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

export default defineConfig({
  ...sharedConfig,
  root: __dirname,
  plugins: [
    vue({
      template: {
        transformAssetUrls: {
          base: null,
          includeAbsolute: false,
        },
      },
    }),
  ],
  test: {
    ...(sharedConfig.test ?? {}),
    name: 'web',
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    execArgv: [
      // Node >= 22 exposes a globalThis.localStorage that is unusable without
      // --localstorage-file and emits a per-worker ExperimentalWarning whenever
      // the happy-dom environment touches it. The shared setup installs a
      // functional Storage; this flag silences that noise.
      '--disable-warning=ExperimentalWarning',
    ],
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    passWithNoTests: false,
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
    server: {
      deps: {
        inline: [],
      },
    },
  },
});
