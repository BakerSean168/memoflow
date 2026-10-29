import fs from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { DesktopAppController } from '../helpers/desktop';
import {
  ensureE2EAccount,
  loadSyncCredentials,
  type SyncCredentials,
} from '../helpers/credentials';
import { completeEmailVerification } from '../../helpers/auth-email-link';
import { deleteGoalIfPresent, openGoalList } from '../helpers/goal';

type CleanupTracker = (goalName: string) => string;

type SyncFixtures = {
  credentials: SyncCredentials;
  desktop: DesktopAppController;
  webPage: Page;
  trackGoal: CleanupTracker;
};

async function submitWebLogin(page: Page, credentials: SyncCredentials): Promise<void> {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });

  const loginTab = page.getByTestId('login-tab');
  if ((await loginTab.count()) > 0) {
    await loginTab.click();
  }

  // Residual 1337: prefer #email/#password (stable); fall back to legacy testids.
  const emailField = page
    .locator('#email')
    .or(page.getByTestId('login-username-input').locator('input'));
  const passwordField = page
    .locator('#password')
    .or(page.getByTestId('login-password-input').locator('input'));
  await emailField.fill(credentials.email);
  await passwordField.fill(credentials.password);
  await page.getByTestId('login-submit-button').click();

  // Unverified accounts stay on /auth with verify-email form after login.
  const verifyForm = page.getByTestId('verify-email-form');
  const leftAuth = page
    .waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
    .then(() => 'shell' as const);
  const needsVerify = verifyForm
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => 'verify' as const);
  const outcome = await Promise.race([leftAuth, needsVerify]);
  if (outcome === 'verify') {
    await completeEmailVerification(page, credentials.email, credentials.password);
  }
}

export const test = base.extend<SyncFixtures>({
  credentials: [
    async ({}, use) => {
      await use(loadSyncCredentials());
    },
    { scope: 'worker' },
  ],

  desktop: async ({ credentials, request, webPage }, use, testInfo) => {
    await ensureE2EAccount(request, credentials);

    const userDataDir = testInfo.outputPath('desktop-user-data');
    const desktop = new DesktopAppController(userDataDir, credentials.apiBaseUrl);

    await desktop.launch();
    // A fresh Desktop starts as a guest Profile, which never syncs. Connect the
    // real cloud account before the specs assert propagation.
    await desktop.connectCloudProfile(webPage);
    await use(desktop);
    await desktop.close();
    if (testInfo.status === testInfo.expectedStatus) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } else {
      console.log(`[sync-fixture] Preserving failed Desktop profile at ${userDataDir}`);
    }
  },

  webPage: async ({ page, credentials, request }, use) => {
    await ensureE2EAccount(request, credentials);
    await submitWebLogin(page, credentials);
    await openGoalList(page, 'web');
    await use(page);
  },

  trackGoal: async ({ desktop, webPage }, use) => {
    const goalNames = new Set<string>();

    await use((goalName: string) => {
      goalNames.add(goalName);
      return goalName;
    });

    for (const goalName of Array.from(goalNames).reverse()) {
      try {
        await deleteGoalIfPresent(webPage, 'web', goalName);
      } catch {
        // Ignore cleanup failures on the web client and let desktop try as a fallback.
      }

      try {
        await deleteGoalIfPresent(desktop.page, 'desktop', goalName);
      } catch {
        // Ignore fallback cleanup failures so teardown still completes.
      }
    }
  },
});

export { expect };
