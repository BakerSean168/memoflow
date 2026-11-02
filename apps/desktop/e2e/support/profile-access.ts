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

export async function unlockLocalProfile(
  app: ElectronApplication,
  gate: Page,
  profileId?: string,
  remember = false,
): Promise<Page> {
  await expect(
    gate
      .getByTestId('desktop-profile-access')
      .or(gate.getByTestId('desktop-profile-password-state')),
  ).toBeVisible();
  if (await gate.getByTestId('desktop-profile-password-state').isVisible()) {
    // Host transitions may preselect the protected target.
  } else if (profileId) await gate.getByTestId(`desktop-profile-open-${profileId}`).click();
  else await gate.locator('[data-testid^="desktop-profile-open-"]').first().click();
  await expect(gate.getByTestId('desktop-profile-password-state')).toBeVisible();
  await gate.locator('input[type="password"]').fill(LOCAL_PASSWORD);
  await gate.getByTestId('desktop-profile-remember').setChecked(remember);
  return workspaceAfter(app, () => gate.getByTestId('desktop-profile-enter').click());
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

export async function switchToProfileGate(
  app: ElectronApplication,
  workspace: Page,
  profileId: string,
): Promise<Page> {
  const next = app.waitForEvent('window');
  try {
    await workspace.getByTestId(`shell-switch-profile-${profileId}`).click();
  } catch (error) {
    // The host deliberately destroys the outgoing renderer during this click.
    // Only accept that teardown when the replacement password gate really opens.
    if (!workspace.isClosed()) throw error;
  }
  const gate = await next;
  await expect(gate.getByTestId('desktop-profile-password-state')).toBeVisible();
  await expect(gate.getByTestId(`desktop-profile-password-${profileId}`)).toBeVisible();
  return gate;
}

/** Enter isolated acceptance sessions through the real identity UI, including restarts. */
export async function enterLocalWorkspace(app: ElectronApplication): Promise<Page> {
  const first = await app.firstWindow({ timeout: 45_000 });
  await expect(
    first
      .getByTestId('app-shell')
      .or(first.getByTestId('desktop-profile-access'))
      .or(first.getByTestId('desktop-profile-password-state')),
  ).toBeVisible();
  if (await first.getByTestId('app-shell').isVisible()) return first;
  if (await first.getByTestId('desktop-profile-password-state').isVisible()) {
    return unlockLocalProfile(app, first);
  }
  if (await first.locator('[data-testid^="desktop-profile-open-"]').count()) {
    return unlockLocalProfile(app, first);
  }
  return registerLocalProfile(app, first);
}
