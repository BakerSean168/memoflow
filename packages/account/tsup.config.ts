import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/api/index.ts', 'src/electron/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    'electron',
    '@memoflow/utils',
    '@memoflow/contracts',
    '@memoflow/database',
    '@memoflow/patterns',
    'express',
    'zod',
  ],
});
