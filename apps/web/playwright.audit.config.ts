import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';
import { WEB_AUDIT_SPECS } from './web-audit-specs.mjs';

export default defineConfig(baseConfig, {
  testMatch: WEB_AUDIT_SPECS.map((spec) => `**/${spec}`),
  testIgnore: [],
  // Nightly is an audit lane: collect the complete failure map instead of inheriting
  // the required Web Flow early-stop budget. Keep one worker until state isolation is proven.
  maxFailures: 0,
  retries: 0,
  reporter:
    process.env.TEST_INVENTORY_LIST === '1'
      ? [['list']]
      : process.env.CI
        ? [
            ['html', { outputFolder: 'playwright-audit-report', open: 'never' }],
            ['json', { outputFile: 'test-results/audit-results.json' }],
            ['junit', { outputFile: 'test-results/audit-results.junit.xml' }],
            ['list'],
            ['github'],
          ]
        : [
            ['html', { outputFolder: 'playwright-audit-report' }],
            ['json', { outputFile: 'test-results/audit-results.json' }],
            ['junit', { outputFile: 'test-results/audit-results.junit.xml' }],
            ['list'],
          ],
});
