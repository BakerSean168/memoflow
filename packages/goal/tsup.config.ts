import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/analytics/index.ts',
    'src/events/index.ts',
    'src/schedule-execution/index.ts',
    'src/schedule-projection/index.ts',
    'src/api/index.ts',
    'src/electron/index.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    'electron',
    '@memoflow/utils',
    '@memoflow/http-client',
    '@memoflow/database',
    '@memoflow/patterns',
    'express',
    'zod',
  ],
});
