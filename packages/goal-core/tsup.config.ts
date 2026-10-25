import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ids.ts',
    'src/key-result-progress-calculator.ts',
    'src/goal-record-preview.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [/^@memoflow\//],
});
