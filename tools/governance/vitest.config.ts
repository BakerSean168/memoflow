import { defineConfig } from 'vitest/config';
import { createVitestReportConfig } from '../../vitest.shared.ts';

export default defineConfig({
  test: {
    name: 'governance-tools',
    ...createVitestReportConfig(import.meta.dirname, 'governance-tools'),
    root: import.meta.dirname,
    environment: 'node',
    globals: true,
    // These specs launch repository-wide filesystem/AST audits in subprocesses.
    // Run files sequentially so concurrent scans do not exhaust their fixed budgets.
    fileParallelism: false,
    include: ['__tests__/**/*.test.mjs'],
  },
});
