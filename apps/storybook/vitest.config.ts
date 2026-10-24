import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

/**
 * Browser component suite: the same three audited Storybook interaction files
 * are used by the Storybook UI and CI. Other Vitest projects remain untouched.
 *
 * Storybook's plugin loads our Vue/Vite aliases and annotations itself.
 */
export default defineConfig({
  plugins: [
    {
      name: 'storybook-workspace-watch',
      configureServer(server) {
        // The UI starts Vitest at apps/storybook; the component sources live
        // outside that root. Register them with the shared watch server too.
        if (server.config.server.watch !== null) {
          server.watcher.add(path.join(workspaceRoot, 'packages'));
        }
      },
    },
  ],
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(import.meta.dirname, '.storybook'),
            storybookUrl: 'http://127.0.0.1:4402',
            tags: { include: ['ci-interaction'], exclude: [], skip: [] },
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            api: { host: '127.0.0.1', port: 63315 },
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
          // Vite 8 / Rolldown needs the CJS Testing Library graph prebundled.
          // Never turn off the optimizer, which breaks browser ESM interop.
          deps: {
            optimizer: {
              web: {
                enabled: true,
                include: [
                  'storybook/test',
                  '@testing-library/dom',
                  // Singleton runtime graph: if Vite prebundles these in two
                  // passes, the preview's Pinia instance and the components'
                  // instance split and getActivePinia() fails (clean-checkout
                  // CI reproduction, VNext Q4).
                  'vue',
                  'pinia',
                  'vue-i18n',
                  'vue-router',
                  '@tanstack/vue-query',
                  'zod',
                ],
              },
            },
          },
          maxWorkers: 1,
          retry: 0,
          testTimeout: 30000,
        },
      },
    ],
  },
});
