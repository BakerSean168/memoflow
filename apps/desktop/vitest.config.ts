import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { createSharedConfig } from '../../vitest.shared.ts';
import {
  createAppVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
  createUiVueSourceAliasEntries,
} from '../../vite.workspace-aliases.ts';

// Desktop renderer tests import many workspace packages through their source
// entrypoints so Electron-specific adapters stay aligned with local edits.
const desktopTestWorkspaceEntries = [
  ['@memoflow/account/client', 'packages/account/src/client/index.ts'],
  ['@memoflow/account/electron', 'packages/account/src/electron/index.ts'],
  ['@memoflow/goal/client', 'packages/goal/src/client/index.ts'],
  ['@memoflow/goal/electron', 'packages/goal/src/electron/index.ts'],
  ['@memoflow/goal/schedule-execution', 'packages/goal/src/schedule-execution/index.ts'],
  ['@memoflow/goal/schedule-projection', 'packages/goal/src/schedule-projection/index.ts'],
  ['@memoflow/governance/client', 'packages/governance/src/client/index.ts'],
  ['@memoflow/governance/electron', 'packages/governance/src/electron/index.ts'],
  ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
  ['@memoflow/task/electron', 'packages/task/src/electron/index.ts'],
  ['@memoflow/task/schedule-execution', 'packages/task/src/schedule-execution/index.ts'],
  ['@memoflow/task/schedule-projection', 'packages/task/src/schedule-projection/index.ts'],
  ['@memoflow/schedule/client', 'packages/schedule/src/client/index.ts'],
  ['@memoflow/schedule/electron', 'packages/schedule/src/electron/index.ts'],
  ['@memoflow/reminder/routine-runtime', 'packages/reminder/src/routine-runtime/index.ts'],
  ['@memoflow/repository/client', 'packages/repository/src/client/index.ts'],
  ['@memoflow/repository/electron', 'packages/repository/src/electron/index.ts'],
  ['@memoflow/notification/client', 'packages/notification/src/client/index.ts'],
  ['@memoflow/reminder/client', 'packages/reminder/src/client/index.ts'],
  ['@memoflow/notification/electron', 'packages/notification/src/electron/index.ts'],
  ['@memoflow/setting/client', 'packages/setting/src/client/index.ts'],
  ['@memoflow/setting/electron', 'packages/setting/src/electron/index.ts'],
  ['@memoflow/data-portability/client', 'packages/data-portability/src/client/index.ts'],
  ['@memoflow/data-portability/electron', 'packages/data-portability/src/electron/index.ts'],
  ['@memoflow/ai/client', 'packages/ai/src/client/index.ts'],
  ['@memoflow/ai/electron', 'packages/ai/src/electron/index.ts'],
  ['@memoflow/ipc-client', 'packages/ipc-client/src/index.ts'],
  ['@memoflow/powersync-schema', 'packages/powersync-schema/src/index.ts'],
  ['@memoflow/cloud-auth', 'packages/cloud-auth/src/index.ts'],
] as const;
const sharedConfig = createSharedConfig({
  projectRoot: import.meta.dirname,
  // The desktop app pulls in Electron-facing modules and workspace aliases
  // that behave more predictably under the Node test environment.
  environment: 'node',
  aliasEntries: [
    { find: /^electron$/, replacement: './test-support/electron.stub.ts' },
    ...createAppVueSourceAliasEntries(import.meta.dirname + '/../..'),
    ...createUiVueSourceAliasEntries(import.meta.dirname + '/../..'),
    ...createWorkspaceSourceAliasEntries(import.meta.dirname + '/../..', desktopTestWorkspaceEntries),
  ],
}) as Record<string, unknown>;

export default defineConfig({
  ...sharedConfig,
  root: import.meta.dirname,
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
    name: 'desktop',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Boundary files have one primary owner and are run by the boundary target.
    exclude: [
      'src/main/ipc/**/*.{test,spec}.{ts,tsx}',
      'src/main/modules/auto-update/ipc/**/*.{test,spec}.{ts,tsx}',
      'src/main/**/*-ipc.{test,spec}.{ts,tsx}',
      'src/main/**/*ipc*.{test,spec}.{ts,tsx}',
      'src/main/database/**/*.{test,spec}.{ts,tsx}',
      'src/main/__tests__/bootstrap.{test,spec}.{ts,tsx}',
      'src/main/lifecycle/**/*.{test,spec}.{ts,tsx}',
    ],
    environment: 'node',
  },
});
