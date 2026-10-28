/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/patterns',
  plugins: [
    {
      name: 'patterns-markdown-assets',
      buildStart() {
        // Keep the former *.md copy paths; publicDir would copy the whole package.
        for (const entry of readdirSync(import.meta.dirname, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
          const file = join(import.meta.dirname, entry.name);
          this.addWatchFile(file);
          this.emitFile({ type: 'asset', fileName: entry.name, source: readFileSync(file) });
        }
      },
    },
  ],
  resolve: { tsconfigPaths: true },
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ tsconfigPaths() ],
  // },
  test: {
    name: 'patterns',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/patterns',
      provider: 'v8' as const,
    },
  },
}));
