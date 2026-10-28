import vue from '@vitejs/plugin-vue';
import { mergeConfig } from 'vitest/config';
import { createPackageVitestConfig } from '../../vitest.shared.ts';
import { createUiVueSourceAliasEntries } from '../../vite.workspace-aliases.ts';
import path from 'node:path';

export default mergeConfig(
  createPackageVitestConfig({
    projectRoot: import.meta.dirname,
    name: 'repository-ui',
    environment: 'happy-dom',
    aliasEntries: [
      {
        find: '@repository-ui-test-host/ai/chatViewHelpers',
        replacement: path.resolve(
          import.meta.dirname,
          '../ai-ui/src/composables/chatViewHelpers.ts',
        ),
      },
      {
        find: '@repository-ui-test-host/layouts/shell/useKnowledgeNativeSurface',
        replacement: path.resolve(
          import.meta.dirname,
          'src/composables/useKnowledgeNativeSurface.ts',
        ),
      },
      {
        find: /^@repository-ui-test-host\/(.+)$/,
        replacement: path.resolve(import.meta.dirname, '../app-vue/src/$1'),
      },
      ...createUiVueSourceAliasEntries(path.resolve(import.meta.dirname, '../..')),
    ],
    aliases: {
      '@memoflow/repository-client': '../../packages/repository-client/src/index.ts',
      '@memoflow/repository-contracts': '../../packages/repository-contracts/src/index.ts',
      '@memoflow/desktop-contracts': '../../packages/desktop-contracts/src/index.ts',
      '@memoflow/http-client': '../../packages/http-client/src/index.ts',
      '@memoflow/ipc-client': '../../packages/ipc-client/src/index.ts',
      '@memoflow/transport-contracts': '../../packages/transport-contracts/src/index.ts',
    },
    setupFiles: ['../app-vue/src/test/setup.ts', './vitest.setup.ts'],
  }),
  { plugins: [vue()], test: { include: ['src/**/*.{test,spec}.{ts,tsx}'] } },
);
