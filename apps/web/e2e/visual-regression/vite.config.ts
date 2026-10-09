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
          ['@memoflow/goal/client', 'packages/goal/src/client/index.ts'],
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
