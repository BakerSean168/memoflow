import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server/index.ts',
    'src/schedule-execution/index.ts',
    'src/schedule-execution/routine.ts',
    'src/schedule-projection/index.ts',
    'src/schedule-projection/routine.ts',
    'src/routine-runtime/index.ts',
    'src/method-library/index.ts',
    'src/api/index.ts',
    'src/client/index.ts',
    'src/electron/index.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    'electron',
    '@memoflow/utils',
    '@memoflow/contracts',
    '@memoflow/http-client',
    '@memoflow/database',
    '@memoflow/domain-shared',
    '@memoflow/domain-shared/shared',
    '@memoflow/schedule',
    '@memoflow/patterns',
    'express',
    'zod',
  ],
});
