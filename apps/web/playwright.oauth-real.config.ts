import { defineConfig, devices } from '@playwright/test';
import { getRealOAuthPlaywrightBaseURL } from './playwright.server';

const hostDevOrigin = getRealOAuthPlaywrightBaseURL();

/**
 * Real-provider GitHub OAuth acceptance.
 *
 * This lane deliberately does NOT start localhost API/Web servers. MemoFlow Dev
 * Test owns the canonical Tailnet callback, so the browser must exercise the
 * already-running host-dev runtime that issued the OAuth state.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/authentication/auth-oauth-real.spec.ts'],
  timeout: 6 * 60 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/oauth-real-results.json' }]],
  use: {
    baseURL: hostDevOrigin,
    headless: false,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 30 * 1000,
  },
  projects: [
    {
      name: 'chromium-headed-real-oauth',
      use: { ...devices['Desktop Chrome'], headless: false },
    },
  ],
});
