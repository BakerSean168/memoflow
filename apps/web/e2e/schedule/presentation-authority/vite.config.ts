import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import {
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
  createContractsAliasEntries,
} from '../../../../../vite.workspace-aliases.ts';

const root = import.meta.dirname;
const workspace = path.resolve(root, '../../../../..');
const capsuleCalendarFixture = path.resolve(root, 'useCalendarView.fixture.ts');

export default defineConfig({
  root,
  plugins: [
    {
      name: 'schedule-capsule-calendar-fixture',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          importer?.includes(
            '/packages/app-vue/src/layouts/shell/previews/ScheduleCapsulePreview.vue',
          ) &&
          source.endsWith('modules/schedule/composables/useCalendarView')
        ) {
          return capsuleCalendarFixture;
        }
        return null;
      },
    },
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      ...createUiVueSourceAliasEntries(workspace),
      ...createContractsAliasEntries(workspace),
      ...createWorkspaceSourceAliasEntries(workspace, [
        ['@memoflow/app-vue', 'packages/app-vue/src'],
        ['@memoflow/schedule/client', 'packages/schedule/src/client/index.ts'],
        ['@memoflow/time', 'packages/time/src/index.ts'],
        ['@memoflow/utils/logger', 'packages/utils/src/logger/index.ts'],
        ['@memoflow/utils/shared', 'packages/utils/src/shared/index.ts'],
      ]),
    ],
  },
  preview: { host: '127.0.0.1', port: 53181, strictPort: true },
  server: { host: '127.0.0.1', port: 53181, strictPort: true },
  build: {
    outDir: path.join(workspace, 'dist/schedule-presentation-authority-acceptance'),
    emptyOutDir: true,
  },
});
