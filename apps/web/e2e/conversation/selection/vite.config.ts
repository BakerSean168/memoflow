import { defineConfig, mergeConfig } from 'vite';
import path from 'node:path';
import base from '../../task/visual-grammar/vite.config.ts';
export default mergeConfig(
  base,
  defineConfig({
    root: import.meta.dirname,
    server: { host: '127.0.0.1', port: 53173, strictPort: true },
    preview: { host: '127.0.0.1', port: 53173, strictPort: true },
    build: {
      outDir: path.resolve(
        import.meta.dirname,
        '../../../../../dist/conversation-selection-acceptance',
      ),
      emptyOutDir: true,
    },
  }),
);
