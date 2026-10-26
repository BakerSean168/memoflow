import path from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import schedule from '../schedule/presentation-authority/vite.config.ts';
import {
  createReliableMessagingContractsAliasEntries,
  createOperationsContractsAliasEntries,
  createNotificationContractsAliasEntries,
  createAssetsAliasEntries,
  createWorkspaceSourceAliasEntries,
} from '../../../../vite.workspace-aliases.ts';
const workspace = path.resolve(import.meta.dirname, '../../../..');
export default defineConfig(({ mode }) =>
  mergeConfig(schedule, {
    base: mode === 'desktop' ? '/desktop/' : '/',
    root: import.meta.dirname,
    resolve: {
      alias: [
        {
          find: /^(?:\.\.\/)+(?:apps\/web\/)?src\/styles\/index\.css$/,
          replacement: path.join(
            workspace,
            mode === 'desktop'
              ? 'apps/desktop/src/renderer/styles/index.css'
              : 'apps/web/src/styles/index.css',
          ),
        },
        ...createReliableMessagingContractsAliasEntries(workspace),
        ...createOperationsContractsAliasEntries(workspace),
        ...createNotificationContractsAliasEntries(workspace),
        ...createAssetsAliasEntries(workspace),
        ...createWorkspaceSourceAliasEntries(workspace, [
          ['@memoflow/reminder/method-library', 'packages/reminder/src/method-library/index.ts'],
          ['@memoflow/utils/domain', 'packages/utils/src/domain/index.ts'],
          ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
          ['@memoflow/goal-client', 'packages/goal-client/src/index.ts'],
          ['@memoflow/goal-core/ids', 'packages/goal-core/src/ids.ts'],
          [
            '@memoflow/goal-core/key-result-progress-calculator',
            'packages/goal-core/src/key-result-progress-calculator.ts',
          ],
          [
            '@memoflow/goal-core/goal-record-preview',
            'packages/goal-core/src/goal-record-preview.ts',
          ],
          ['@memoflow/goal-core', 'packages/goal-core/src/index.ts'],
          ['@memoflow/shared-primitives/command', 'packages/shared-primitives/src/command.ts'],
          ['@memoflow/shared-primitives/duration', 'packages/shared-primitives/src/duration.ts'],
          ['@memoflow/shared-primitives/hm', 'packages/shared-primitives/src/hm.ts'],
          ['@memoflow/shared-primitives/ids', 'packages/shared-primitives/src/ids.ts'],
          ['@memoflow/shared-primitives/instant', 'packages/shared-primitives/src/instant.ts'],
          ['@memoflow/shared-primitives/runtime', 'packages/shared-primitives/src/runtime.ts'],
          [
            '@memoflow/shared-primitives/time-zone-id',
            'packages/shared-primitives/src/time-zone-id.ts',
          ],
          [
            '@memoflow/shared-primitives/transfer-date',
            'packages/shared-primitives/src/transfer-date.ts',
          ],
          ['@memoflow/shared-primitives/ymd', 'packages/shared-primitives/src/ymd.ts'],
          [
            '@memoflow/shared-primitives/zod-extensions',
            'packages/shared-primitives/src/zod-extensions.ts',
          ],
          ['@memoflow/shared-primitives', 'packages/shared-primitives/src/index.ts'],
          [
            '@memoflow/transport-contracts/result/codes',
            'packages/transport-contracts/src/result/codes.ts',
          ],
          [
            '@memoflow/transport-contracts/result/core',
            'packages/transport-contracts/src/result/core.ts',
          ],
          [
            '@memoflow/transport-contracts/result/failure-compat',
            'packages/transport-contracts/src/result/failure-compat.ts',
          ],
          [
            '@memoflow/transport-contracts/result/failure-policy',
            'packages/transport-contracts/src/result/failure-policy.ts',
          ],
          [
            '@memoflow/transport-contracts/result/http',
            'packages/transport-contracts/src/result/http.ts',
          ],
          [
            '@memoflow/transport-contracts/result/ipc',
            'packages/transport-contracts/src/result/ipc.ts',
          ],
          [
            '@memoflow/transport-contracts/result/public-failure',
            'packages/transport-contracts/src/result/public-failure.ts',
          ],
          [
            '@memoflow/transport-contracts/result',
            'packages/transport-contracts/src/result/index.ts',
          ],
          ['@memoflow/transport-contracts/context', 'packages/transport-contracts/src/context.ts'],
          [
            '@memoflow/transport-contracts/execution-context',
            'packages/transport-contracts/src/execution-context.ts',
          ],
          ['@memoflow/transport-contracts', 'packages/transport-contracts/src/index.ts'],
          ['@memoflow/label-contracts', 'packages/label-contracts/src/index.ts'],
          ['@memoflow/relation-contracts', 'packages/relation-contracts/src/index.ts'],
          [
            '@memoflow/data-portability-contracts',
            'packages/data-portability-contracts/src/index.ts',
          ],
          [
            '@memoflow/goal-contracts/test-support/goal.mock',
            'packages/goal-contracts/src/test-support/goal.mock.ts',
          ],
          ['@memoflow/goal-contracts', 'packages/goal-contracts/src/index.ts'],
          ['@memoflow/goal-ui/composables/useGoal', 'packages/goal-ui/src/composables/useGoal.ts'],
          ['@memoflow/goal-ui/host', 'packages/goal-ui/src/goal-ui-host.ts'],
          ['@memoflow/goal-ui', 'packages/goal-ui/src/index.ts'],
          ['@memoflow/workspace-contracts', 'packages/workspace-contracts/src/index.ts'],
          [
            '@memoflow/desktop-contracts/auth-context',
            'packages/desktop-contracts/src/auth-context.ts',
          ],
          ['@memoflow/desktop-contracts/database', 'packages/desktop-contracts/src/database.ts'],
          [
            '@memoflow/desktop-contracts/desktop-update',
            'packages/desktop-contracts/src/desktop-update.ts',
          ],
          [
            '@memoflow/desktop-contracts/device-notification-preference',
            'packages/desktop-contracts/src/device-notification-preference.ts',
          ],
          [
            '@memoflow/desktop-contracts/focus-window',
            'packages/desktop-contracts/src/focus-window.ts',
          ],
          [
            '@memoflow/desktop-contracts/intervention-window',
            'packages/desktop-contracts/src/intervention-window.ts',
          ],
          [
            '@memoflow/desktop-contracts/ipc-channels',
            'packages/desktop-contracts/src/ipc-channels.ts',
          ],
          [
            '@memoflow/desktop-contracts/profile-access',
            'packages/desktop-contracts/src/profile-access.ts',
          ],
          ['@memoflow/desktop-contracts', 'packages/desktop-contracts/src/index.ts'],
          [
            '@memoflow/host-runtime/electron-ipc',
            'packages/host-runtime/src/electron-ipc/index.ts',
          ],
          ['@memoflow/host-runtime', 'packages/host-runtime/src/index.ts'],
          ['@memoflow/http-client', 'packages/http-client/src/index.ts'],
          ['@memoflow/ipc-client', 'packages/ipc-client/src/index.ts'],
          ['@memoflow/domain-shared/shared', 'packages/domain-shared/src/shared/index.ts'],
          ['@memoflow/domain-shared', 'packages/domain-shared/src/index.ts'],
          ['@memoflow/reminder/client', 'packages/reminder/src/client/index.ts'],
          ['@memoflow/repository/client', 'packages/repository/src/client/index.ts'],
          ['@memoflow/ai/client', 'packages/ai/src/client/index.ts'],
          ['@memoflow/notification-client', 'packages/notification-client/src/index.ts'],
        ]),
      ],
    },
    preview: { port: 53191 },
    server: { port: 53191 },
    build: {
      outDir: path.join(workspace, 'dist/visual-regression', mode === 'desktop' ? 'desktop' : ''),
      emptyOutDir: true,
    },
  }),
);
