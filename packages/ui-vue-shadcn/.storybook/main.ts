import type { StorybookConfig } from '@storybook/vue3-vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import {
  createAppVueSourceAliasEntries,
  createAssetsAliasEntries,
  createContractsAliasEntries,
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
} from '../../../vite.workspace-aliases.ts';

const workspace = path.resolve(import.meta.dirname, '../../..');
const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(js|jsx|ts|tsx|vue)',
    '../../app-vue/src/**/*.stories.@(js|jsx|ts|tsx|vue)',
  ],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  async viteFinal(config) {
    const aliases = config.resolve?.alias ?? [];
    return {
      ...config,
      plugins: [...(config.plugins ?? []), tailwindcss()],
      resolve: {
        ...config.resolve,
        alias: [
          ...createAppVueSourceAliasEntries(workspace),
          ...createAssetsAliasEntries(workspace),
          ...createUiVueSourceAliasEntries(workspace),
          ...createContractsAliasEntries(workspace),
          ...createWorkspaceSourceAliasEntries(workspace, [
            ['@memoflow/goal/client', 'packages/goal/src/client/index.ts'],
            ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
            ['@memoflow/time', 'packages/time/src/index.ts'],
            ['@memoflow/utils/logger', 'packages/utils/src/logger/index.ts'],
            ['@memoflow/utils/shared', 'packages/utils/src/shared/index.ts'],
          ]),
          ...(Array.isArray(aliases) ? aliases : Object.entries(aliases).map(([find, replacement]) => ({ find, replacement }))),
        ],
      },
      build: { ...config.build, chunkSizeWarningLimit: 1500 },
    };
  },
};
export default config;
