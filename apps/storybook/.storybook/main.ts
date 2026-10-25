/* eslint-disable @nx/enforce-module-boundaries -- Storybook config imports workspace helpers and packages */
import type { StorybookConfig } from '@storybook/vue3-vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import {
  createAppVueSourceAliasEntries,
  createAssetsAliasEntries,
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
  '../../../packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.stories.ts',
  '../../../packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.stories.ts',
  '../../../packages/app-vue/src/shared/components/__stories__/BrowserInteraction.stories.ts',
];
const config: StorybookConfig = {
  stories: process.env.VITEST
    ? browserTestStories
    : [
        '../../../packages/ui-vue-shadcn/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
        '../../../packages/app-vue/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
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
