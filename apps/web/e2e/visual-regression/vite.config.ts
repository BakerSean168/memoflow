import path from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import schedule from '../schedule/presentation-authority/vite.config.ts';
import {
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
          ['@memoflow/shared-primitives', 'packages/shared-primitives/src/index.ts'],
          ['@memoflow/http-client', 'packages/http-client/src/index.ts'],
          ['@memoflow/reminder/client', 'packages/reminder/src/client/index.ts'],
          ['@memoflow/repository/client', 'packages/repository/src/client/index.ts'],
          ['@memoflow/ai/client', 'packages/ai/src/client/index.ts'],
          ['@memoflow/notification/client', 'packages/notification/src/client/index.ts'],
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
