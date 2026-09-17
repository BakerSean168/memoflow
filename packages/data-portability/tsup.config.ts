import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/api/index.ts',
    'src/client/index.ts',
    'src/electron/index.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    '@memoflow/utils',
    '@memoflow/contracts',
    '@memoflow/http-client',
    '@memoflow/database',
    '@memoflow/goal',
    '@memoflow/task',
    '@memoflow/repository',
    '@memoflow/schedule',
    '@memoflow/ai',
    '@memoflow/notification',
    '@memoflow/setting',
    'electron',
    'express',
    'zod',
  ],
});
