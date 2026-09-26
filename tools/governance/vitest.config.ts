import { defineConfig } from 'vitest/config';
import { createVitestReportConfig } from '../../vitest.shared.ts';

export default defineConfig({
  test: {
    name: 'governance-tools',
    ...createVitestReportConfig(import.meta.dirname, 'governance-tools'),
    root: import.meta.dirname,
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.mjs'],
  },
});
