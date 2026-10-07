import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/server/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [/^@memoflow\//, /^@modelcontextprotocol\//, 'zod'],
});
