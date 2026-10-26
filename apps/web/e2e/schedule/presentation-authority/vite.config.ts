import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import {
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
  createReliableMessagingContractsAliasEntries,
  createOperationsContractsAliasEntries,
  createNotificationContractsAliasEntries,
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
          source === '@memoflow/schedule-ui'
        ) {
          return capsuleCalendarFixture;
        }
        if (
          importer?.includes('/packages/schedule-ui/src/views/ScheduleCalendarView.vue') &&
          source.endsWith('composables/useCalendarView')
        ) {
          return path.resolve(root, 'plannerCalendar.fixture.ts');
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
      ...createReliableMessagingContractsAliasEntries(workspace),
      ...createOperationsContractsAliasEntries(workspace),
      ...createNotificationContractsAliasEntries(workspace),
      ...createContractsAliasEntries(workspace),
      ...createWorkspaceSourceAliasEntries(workspace, [
        ['@memoflow/app-vue', 'packages/app-vue/src'],
        ['@memoflow/schedule-ui', 'packages/schedule-ui/src'],
        ['@memoflow/schedule-contracts', 'packages/schedule-contracts/src/index.ts'],
        ['@memoflow/schedule-client', 'packages/schedule-client/src/index.ts'],
        ['@memoflow/goal-contracts', 'packages/goal-contracts/src/index.ts'],
        ['@memoflow/http-client', 'packages/http-client/src/index.ts'],
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
