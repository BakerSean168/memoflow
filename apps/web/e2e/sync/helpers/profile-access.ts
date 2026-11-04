/**
 * Local mirror of `apps/desktop/e2e/support/profile-access.ts`.
 *
 * The sync suite must enter through the desktop identity gate (#785/#788), but
 * e2e files sit outside Nx's project graph: importing the desktop app's helper
 * by relative path trips `@nx/enforce-module-boundaries`. Keep the same shape,
 * test ids and password as the upstream helper so the two do not drift.
 */
import { expect, type Page } from '@playwright/test';
import type { ElectronApplication } from 'playwright';

export const LOCAL_PASSWORD = 'Nightly-local-123';

async function workspaceAfter(app: ElectronApplication, enter: () => Promise<void>): Promise<Page> {
  const workspace = app.waitForEvent('window', {
    predicate: async (page) => {
      await page.getByTestId('app-shell').waitFor({ state: 'visible', timeout: 45_000 });
      return true;
    },
    timeout: 60_000,
  });
  await enter();
  return workspace;
}

export async function registerLocalProfile(
  app: ElectronApplication,
  gate: Page,
  name = 'Nightly Local',
): Promise<Page> {
  await expect(gate.getByTestId('desktop-profile-access')).toBeVisible();
  await gate.getByTestId('desktop-profile-create-local').click();
  await gate.getByTestId('desktop-profile-go-register').click();
  await gate.getByTestId('desktop-profile-register-mode-local').click();
  await gate.getByTestId('desktop-profile-register-name').fill(name);
  await gate.getByTestId('desktop-profile-register-password').fill(LOCAL_PASSWORD);
  await gate.getByTestId('desktop-profile-register-confirm').fill(LOCAL_PASSWORD);
  return workspaceAfter(app, () => gate.getByTestId('desktop-profile-register-submit').click());
}

export async function selectRememberedProfile(
  app: ElectronApplication,
  gate: Page,
  profileId?: string,
): Promise<Page> {
  await expect(gate.getByTestId('desktop-profile-access')).toBeVisible();
  return workspaceAfter(app, () =>
    profileId
      ? gate.getByTestId(`desktop-profile-open-${profileId}`).click()
      : gate.locator('[data-testid^="desktop-profile-open-"]').first().click(),
  );
}
