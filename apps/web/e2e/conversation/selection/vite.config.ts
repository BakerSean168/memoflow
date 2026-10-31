import { defineConfig, mergeConfig } from 'vite';
import path from 'node:path';
import base from '../../task/visual-grammar/vite.config.ts';
import { createAiUiAliasEntries } from '../../../../../vite.workspace-aliases.ts';

const workspace = path.resolve(import.meta.dirname, '../../../../..');
export default mergeConfig(
  base,
  defineConfig({
    root: import.meta.dirname,
    // Harness-only: the sidebar and the chat session share ai-ui source modules.
    resolve: { alias: createAiUiAliasEntries(workspace) },
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
