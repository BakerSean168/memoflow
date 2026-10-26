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
    find: '@memoflow/goal-client',
    replacement: resolve(import.meta.dirname, '../../packages/goal-client/src/index.ts'),
  },
  {
    find: '@memoflow/goal-core/ids',
    replacement: resolve(import.meta.dirname, '../../packages/goal-core/src/ids.ts'),
  },
  {
    find: '@memoflow/goal-core/key-result-progress-calculator',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/goal-core/src/key-result-progress-calculator.ts',
    ),
  },
  {
    find: '@memoflow/goal-core/goal-record-preview',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/goal-core/src/goal-record-preview.ts',
    ),
  },
  {
    find: '@memoflow/goal-core',
    replacement: resolve(import.meta.dirname, '../../packages/goal-core/src/index.ts'),
  },
  {
    find: '@memoflow/shared-primitives/command',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/command.ts'),
  },
  {
    find: '@memoflow/shared-primitives/duration',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/duration.ts'),
  },
  {
    find: '@memoflow/shared-primitives/hm',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/hm.ts'),
  },
  {
    find: '@memoflow/shared-primitives/ids',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/ids.ts'),
  },
  {
    find: '@memoflow/shared-primitives/instant',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/instant.ts'),
  },
  {
    find: '@memoflow/shared-primitives/runtime',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/runtime.ts'),
  },
  {
    find: '@memoflow/shared-primitives/time-zone-id',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/shared-primitives/src/time-zone-id.ts',
    ),
  },
  {
    find: '@memoflow/shared-primitives/transfer-date',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/shared-primitives/src/transfer-date.ts',
    ),
  },
  {
    find: '@memoflow/shared-primitives/ymd',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/ymd.ts'),
  },
  {
    find: '@memoflow/shared-primitives/zod-extensions',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/shared-primitives/src/zod-extensions.ts',
    ),
  },
  {
    find: '@memoflow/shared-primitives',
    replacement: resolve(import.meta.dirname, '../../packages/shared-primitives/src/index.ts'),
  },
  {
    find: '@memoflow/transport-contracts/result/codes',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/codes.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result/core',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/core.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result/failure-compat',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/failure-compat.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result/failure-policy',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/failure-policy.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result/http',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/http.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result/ipc',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/ipc.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result/public-failure',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/public-failure.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/result',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/result/index.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts/context',
    replacement: resolve(import.meta.dirname, '../../packages/transport-contracts/src/context.ts'),
  },
  {
    find: '@memoflow/transport-contracts/execution-context',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/transport-contracts/src/execution-context.ts',
    ),
  },
  {
    find: '@memoflow/transport-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/transport-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/reliable-messaging-contracts\/(.+)$/,
    replacement: resolve(import.meta.dirname, '../../packages/reliable-messaging-contracts/src/$1'),
  },
  {
    find: '@memoflow/reliable-messaging-contracts',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/reliable-messaging-contracts/src/index.ts',
    ),
  },
  {
    find: /^@memoflow\/notification-contracts\/(.+)$/,
    replacement: resolve(import.meta.dirname, '../../packages/notification-contracts/src/$1'),
  },
  {
    find: '@memoflow/notification-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/notification-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/operations-contracts\/(.+)$/,
    replacement: resolve(import.meta.dirname, '../../packages/operations-contracts/src/$1'),
  },
  {
    find: '@memoflow/operations-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/operations-contracts/src/index.ts'),
  },
  {
    find: '@memoflow/label-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/label-contracts/src/index.ts'),
  },
  {
    find: '@memoflow/data-portability-contracts',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/data-portability-contracts/src/index.ts',
    ),
  },
  {
    find: '@memoflow/goal-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/goal-contracts/src/index.ts'),
  },
  {
    find: '@memoflow/workspace-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/workspace-contracts/src/index.ts'),
  },
  {
    find: '@memoflow/desktop-contracts/auth-context',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/auth-context.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts/database',
    replacement: resolve(import.meta.dirname, '../../packages/desktop-contracts/src/database.ts'),
  },
  {
    find: '@memoflow/desktop-contracts/desktop-update',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/desktop-update.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts/device-notification-preference',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/device-notification-preference.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts/focus-window',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/focus-window.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts/intervention-window',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/intervention-window.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts/ipc-channels',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/ipc-channels.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts/profile-access',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/desktop-contracts/src/profile-access.ts',
    ),
  },
  {
    find: '@memoflow/desktop-contracts',
    replacement: resolve(import.meta.dirname, '../../packages/desktop-contracts/src/index.ts'),
  },
  {
    find: '@memoflow/host-runtime/electron-ipc',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/host-runtime/src/electron-ipc/index.ts',
    ),
  },
  {
    find: '@memoflow/host-runtime',
    replacement: resolve(import.meta.dirname, '../../packages/host-runtime/src/index.ts'),
  },
  {
    find: '@memoflow/goal/electron',
    replacement: resolve(import.meta.dirname, '../../packages/goal/src/electron/index.ts'),
  },
  {
    find: '@memoflow/goal/schedule-execution',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/goal/src/schedule-execution/index.ts',
    ),
  },
  {
    find: '@memoflow/goal/schedule-projection',
    replacement: resolve(
      import.meta.dirname,
      '../../packages/goal/src/schedule-projection/index.ts',
    ),
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
    replacement: resolve(
      import.meta.dirname,
      '../../packages/data-portability/src/electron/index.ts',
    ),
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
