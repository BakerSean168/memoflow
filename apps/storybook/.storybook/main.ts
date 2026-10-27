/* eslint-disable @nx/enforce-module-boundaries -- Storybook config imports workspace helpers and packages */
import type { StorybookConfig } from '@storybook/vue3-vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import {
  createAppVueSourceAliasEntries,
  createAssetsAliasEntries,
  createReliableMessagingContractsAliasEntries,
  createOperationsContractsAliasEntries,
  createAccountContractsAliasEntries,
  createNotificationContractsAliasEntries,
  createContractsAliasEntries,
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
} from '../../../vite.workspace-aliases.ts';

const workspace = path.resolve(import.meta.dirname, '../../..');

// Storybook UI exposes the full catalog. The Vitest browser project owns only
// the four audited interaction suites (17 stories); loading every draft story
// in a test browser also loads unverified deep application imports.
const browserTestStories = [
  '../../../apps/web/src/auth/WebAuthView.stories.ts',
  '../../../packages/goal-ui/src/components/dialogs/GoalDialog.stories.ts',
  '../../../packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.stories.ts',
  '../../../packages/app-vue/src/shared/components/__stories__/BrowserInteraction.stories.ts',
];
const config: StorybookConfig = {
  stories: process.env.VITEST
    ? browserTestStories
    : [
        '../../../packages/ui-vue-shadcn/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
        '../../../packages/app-vue/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
        '../../../packages/notification-ui/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
        '../../../packages/account-ui/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
        '../../../apps/web/src/auth/*.stories.ts',
      ],
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  async viteFinal(config) {
    const aliases = config.resolve?.alias ?? [];
    return {
      ...config,
      plugins: [vue(), ...(config.plugins ?? []), tailwindcss()],
      resolve: {
        ...config.resolve,
        alias: [
          ...createAppVueSourceAliasEntries(workspace),
          ...createAssetsAliasEntries(workspace),
          ...createUiVueSourceAliasEntries(workspace),
          ...createReliableMessagingContractsAliasEntries(workspace),
          ...createOperationsContractsAliasEntries(workspace),
          ...createAccountContractsAliasEntries(workspace),
          ...createNotificationContractsAliasEntries(workspace),
          ...createContractsAliasEntries(workspace),
          ...createWorkspaceSourceAliasEntries(workspace, [
            ['@memoflow/domain-shared/shared', 'packages/domain-shared/src/shared/index.ts'],
            ['@memoflow/domain-shared', 'packages/domain-shared/src/index.ts'],
            ['@memoflow/http-client', 'packages/http-client/src/index.ts'],
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
            [
              '@memoflow/transport-contracts/context',
              'packages/transport-contracts/src/context.ts',
            ],
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
            [
              '@memoflow/goal-ui/composables/useGoal',
              'packages/goal-ui/src/composables/useGoal.ts',
            ],
            ['@memoflow/goal-ui/host', 'packages/goal-ui/src/goal-ui-host.ts'],
            [
              '@memoflow/notification-ui/host',
              'packages/notification-ui/src/notification-ui-host.ts',
            ],
            ['@memoflow/notification-ui', 'packages/notification-ui/src/index.ts'],
            ['@memoflow/goal-ui', 'packages/goal-ui/src/index.ts'],
            ['@goal-ui-test-host', 'packages/app-vue/src'],
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
            ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
            ['@memoflow/time', 'packages/time/src/index.ts'],
            ['@memoflow/utils/domain', 'packages/utils/src/domain/index.ts'],
            ['@memoflow/utils/errors', 'packages/utils/src/errors/index.ts'],
            ['@memoflow/utils/logger', 'packages/utils/src/logger/index.ts'],
            ['@memoflow/utils/result', 'packages/utils/src/result/index.ts'],
            ['@memoflow/utils/shared', 'packages/utils/src/shared/index.ts'],
            ['@memoflow/utils', 'packages/utils/src/index.ts'],
          ]),
          ...(Array.isArray(aliases)
            ? aliases
            : Object.entries(aliases).map(([find, replacement]) => ({ find, replacement }))),
        ],
      },
      build: { ...config.build, chunkSizeWarningLimit: 1500 },
    };
  },
};
export default config;
