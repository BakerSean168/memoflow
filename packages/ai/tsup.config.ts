import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ports/index.ts',
    'src/api/index.ts',
    'src/electron/index.ts',
    'src/testing/index.ts',
    'src/agent-gateway.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    'electron',
    '@memoflow/ai-client',
    '@memoflow/utils',
    '@memoflow/http-client',
    '@memoflow/database',
    'express',
    'zod',
  ],
});
