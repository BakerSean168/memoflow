import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { createWorkspaceSourceAliasEntries } from '../../vite.workspace-aliases.ts';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: createWorkspaceSourceAliasEntries(workspaceRoot, [
      ['@memoflow/time', 'packages/time/src/index.ts'],
    ]),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
  },
});
