import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import {
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
  createContractsAliasEntries,
} from '../../../../../vite.workspace-aliases.ts';

const root = import.meta.dirname;
const workspace = path.resolve(root, '../../../../..');
export default defineConfig({
  root,
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      ...createUiVueSourceAliasEntries(workspace),
      ...createContractsAliasEntries(workspace),
      ...createWorkspaceSourceAliasEntries(workspace, [
        // Harness-only source access; production package exports stay unchanged.
        ['@memoflow/app-vue', 'packages/app-vue/src'],
        ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
        ['@memoflow/goal/client', 'packages/goal/src/client/index.ts'],
        ['@memoflow/utils/logger', 'packages/utils/src/logger/index.ts'],
        ['@memoflow/time', 'packages/time/src/index.ts'],
        ['@memoflow/http-client', 'packages/http-client/src/index.ts'],
        ['@memoflow/utils/shared', 'packages/utils/src/shared/index.ts'],
      ]),
    ],
  },
  preview: { host: '127.0.0.1', port: 53171, strictPort: true },
  server: { host: '127.0.0.1', port: 53171, strictPort: true },
  build: { outDir: path.join(workspace, 'dist/task-visual-grammar-acceptance'), emptyOutDir: true },
});
