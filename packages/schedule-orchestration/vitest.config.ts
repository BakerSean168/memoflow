/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { createSharedConfig } from '../../vitest.shared.ts';

export default mergeConfig(
  createSharedConfig({
    projectRoot: import.meta.dirname,
    environment: 'node',
    aliasEntries: [
      {
        find: /^@memoflow\/task\/schedule-projection$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../task/src/server/infrastructure/schedule-projection-source.ts',
        ),
      },
      {
        find: /^@memoflow\/goal\/schedule-projection$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../goal/src/server/infrastructure/schedule-projection-source.ts',
        ),
      },
      {
        find: /^@memoflow\/reminder\/schedule-projection$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../reminder/src/server/infrastructure/schedule-projection-source.ts',
        ),
      },
      {
        find: /^@\/server\/(.+)/,
        replacement: path.resolve(import.meta.dirname, '../schedule/src/server/$1'),
      },
    ],
  }),
  defineConfig({
    test: {
      name: 'schedule-orchestration',
      root: import.meta.dirname,
      testTimeout: 10000,
      pool: 'forks',
    },
  }),
);
