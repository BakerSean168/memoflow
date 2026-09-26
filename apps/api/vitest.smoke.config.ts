/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { createVitestReportConfig } from '../../vitest.shared.ts';
import {
  domainResolveAtAlias,
  taskDeepImportResolver,
  taskResolveAliases,
} from '../../vitest.workspace-helpers';

export default defineConfig({
  plugins: [taskDeepImportResolver, domainResolveAtAlias],
  resolve: {
    alias: [
      {
        find: /^@\/(.+)/,
        replacement: path.resolve(import.meta.dirname, '../../packages/task/src/$1'),
      },
      {
        // The smoke lane does not prebuild workspace package dist outputs. Keep
        // its AI imports on explicit public source subpaths so it exercises the
        // current API surface without introducing a catch-all private-path alias.
        find: /^@memoflow\/ai\/api$/,
        replacement: path.resolve(import.meta.dirname, '../../packages/ai/src/api/index.ts'),
      },
      {
        find: /^@memoflow\/ai\/testing$/,
        replacement: path.resolve(import.meta.dirname, '../../packages/ai/src/testing/index.ts'),
      },
      ...taskResolveAliases,
    ],
  },
  test: {
    name: 'api-smoke',
    ...createVitestReportConfig(import.meta.dirname, 'api-smoke'),
    root: import.meta.dirname,
    globals: true,
    environment: 'node',
    include: ['src/__tests__/smoke/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    testTimeout: 15000,
  },
});
