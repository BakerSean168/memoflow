import vue from '@vitejs/plugin-vue';
import { mergeConfig } from 'vitest/config';
import { createPackageVitestConfig } from '../../vitest.shared.ts';
import { createUiVueSourceAliasEntries } from '../../vite.workspace-aliases.ts';
import path from 'node:path';

export default mergeConfig(
  createPackageVitestConfig({
    projectRoot: import.meta.dirname,
    name: 'notification-ui',
    environment: 'happy-dom',
    aliasEntries: [
      // Test-only seam: the package's specs exercise the real app-vue host binding
      // (`installNotificationUiHost`) and the renderer platform fixtures it owns.
      // Production sources inside packages/notification-ui/src hold zero app-vue imports.
      {
        find: /^@notification-ui-test-host\/(.+)$/,
        replacement: path.resolve(import.meta.dirname, '../app-vue/src/$1'),
      },
      ...createUiVueSourceAliasEntries(path.resolve(import.meta.dirname, '../..')),
    ],
    aliases: {
      '@memoflow/notification-client': '../../packages/notification-client/src/index.ts',
      '@memoflow/notification-contracts': '../../packages/notification-contracts/src/index.ts',
      '@memoflow/desktop-contracts': '../../packages/desktop-contracts/src/index.ts',
      '@memoflow/http-client': '../../packages/http-client/src/index.ts',
      '@memoflow/ipc-client': '../../packages/ipc-client/src/index.ts',
      '@memoflow/transport-contracts': '../../packages/transport-contracts/src/index.ts',
      '@memoflow/time': '../../packages/time/src/index.ts',
    },
    setupFiles: ['../app-vue/src/test/setup.ts', './vitest.setup.ts'],
  }),
  { plugins: [vue()], test: { include: ['src/**/*.{test,spec}.{ts,tsx}'] } },
);
