import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { createSharedConfig } from '../../vitest.shared.ts';

// Subpath aliases that must win over the generic @memoflow/<pkg>/... source
// regexes createSharedConfig generates. Kept explicit so IPC specs pin the
// exact entrypoint instead of relying on directory resolution.
const ipcWorkspaceAliasEntries = [
  {
    find: '@memoflow/domain-shared/shared',
    replacement: resolve(import.meta.dirname, '../../packages/domain-shared/src/shared/index.ts'),
  },
  {
    find: '@memoflow/goal/client',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/client/index.ts'),
  },
  {
    find: '@memoflow/goal/electron',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/electron/index.ts'),
  },
  {
    find: '@memoflow/goal/schedule-execution',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/schedule-execution/index.ts'),
  },
  {
    find: '@memoflow/goal/schedule-projection',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/schedule-projection/index.ts'),
  },
  {
    find: '@memoflow/goal/events',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/events/index.ts'),
  },
  {
    find: '@memoflow/goal/analytics',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/analytics/index.ts'),
  },
  {
    find: '@memoflow/account/electron',
    replacement: resolve(import.meta.dirname, '../../packages/account/src/electron/index.ts'),
  },
  {
    find: '@memoflow/data-portability/electron',
    replacement: resolve(import.meta.dirname, '../../packages/data-portability/src/electron/index.ts'),
  },
  {
    find: '@memoflow/schedule-orchestration',
    replacement: resolve(import.meta.dirname, '../../packages/schedule-orchestration/src/index.ts'),
  },
] as const;

const sharedConfig = createSharedConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  reportName: 'desktop-ipc',
  aliasEntries: ipcWorkspaceAliasEntries,
}) as Record<string, unknown>;

export default defineConfig({
  ...sharedConfig,
  test: {
    ...(sharedConfig.test ?? {}),
    name: 'desktop-ipc',
    // Keep IPC tests rooted under src/main so they exercise handler registration
    // without pulling renderer-only setup into the suite.
    root: resolve(import.meta.dirname, 'src/main'),
    include: [
      'ipc/**/*.{test,spec}.ts',
      'modules/auto-update/ipc/**/*.{test,spec}.ts',
      '*-ipc.{test,spec}.ts',
      '**/*-ipc.{test,spec}.ts',
      'desktop-shared-ipc*.{test,spec}.ts',
      'utils/ipc-cache*.{test,spec}.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: true,
    // Centralized setup owns the Electron mock surface for all IPC specs.
    setupFiles: ['./ipc/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Coverage stays focused on IPC handlers; test doubles live alongside them.
      include: ['ipc/**/*.ts'],
      exclude: ['ipc/__tests__/**', 'ipc/index.ts'],
    },
    testTimeout: 10000,
  },
});
