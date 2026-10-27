import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server/index.ts',
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
    '@memoflow/http-client',
    '@memoflow/database',
    'express',
    'multer',
    'zod',
  ],
});
