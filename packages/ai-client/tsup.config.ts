import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/local-agent.ts',
    'src/agent-instance.ts',
    'src/runtime-assistant.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [/^@memoflow\//],
});
