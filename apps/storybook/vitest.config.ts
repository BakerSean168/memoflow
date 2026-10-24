import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

/**
 * Browser component suite: the same three audited Storybook interaction files
 * are used by the Storybook UI and CI. Other Vitest projects remain untouched.
 *
 * Storybook's plugin loads our Vue/Vite aliases and annotations itself.
 */
export default defineConfig({
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
              web: { enabled: true, include: ['storybook/test', '@testing-library/dom'] },
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
