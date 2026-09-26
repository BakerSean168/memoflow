import { defineConfig } from 'vitest/config';
import { createVitestReportConfig } from '../../vitest.shared.ts';

export default defineConfig({
  test: {
    ...createVitestReportConfig(import.meta.dirname, 'migrator'),
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
