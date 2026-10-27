import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/index.ts', 'src/method-library/index.ts'], format: ['esm'], dts: false, clean: true, sourcemap: true, external: [/^@memoflow\//] });
