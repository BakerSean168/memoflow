import { test, expect } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import {
  ACCOUNT_TEST_PASSWORD,
  confirmGlobalDialog,
  createAccountAuditEmail,
  openAccountSettings,
} from './account-settings.helpers';

test.describe('Account & Privacy settings', () => {
  test('[P1] renders the canonical account profile with cloud identity', async ({ page }) => {
    const email = createAccountAuditEmail('e2e-account-profile');
    await openAccountSettings(page, { email });

    await expect(page.getByTestId('account-center-view')).toContainText(email);
    await expect(page.getByTestId('account-profile-save')).toBeVisible();
    await expect(page.getByTestId('cloud-password-current')).toBeVisible();
    await expect(page.getByTestId('account-logout-button')).toBeVisible();
  });

  test('[P1] updates the profile nickname and persists it after refresh', async ({ page }) => {
    await openAccountSettings(page);

    const nickname = `Audit-${String(Date.now()).slice(-8)}`;
    const nicknameInput = page.getByTestId('account-profile-nickname');
    await nicknameInput.fill(nickname);

    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.endsWith('/api/v1/accounts/me'),
      { timeout: TIMEOUT_CONFIG.API_REQUEST },
    );
    await page.getByTestId('account-profile-save').click();
    expect((await updateResponse).ok()).toBe(true);

    await expect(nicknameInput).toHaveValue(nickname);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-settings-section')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('account-profile-nickname')).toHaveValue(nickname, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });

  test('[P2] changes the cloud password through the account settings owner', async ({ page }) => {
    await openAccountSettings(page);

    const nextPassword = 'NextTest123456!';
    await page.getByTestId('cloud-password-current').fill(ACCOUNT_TEST_PASSWORD);
    await page.getByTestId('cloud-password-new').fill(nextPassword);
    await page.getByTestId('cloud-password-confirm').fill(nextPassword);

    const changeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/auth/change-password'),
      { timeout: TIMEOUT_CONFIG.API_REQUEST },
    );
    await page.getByTestId('cloud-password-change-button').click();
    expect((await changeResponse).ok()).toBe(true);

    await expect(page.getByTestId('cloud-password-current')).toHaveValue('');
    await expect(page.getByTestId('cloud-password-new')).toHaveValue('');
    await expect(page.getByTestId('cloud-password-confirm')).toHaveValue('');
    await expect(page.getByTestId('password-mutation-error')).toHaveCount(0);
  });

  test('[P0] signs out from Account & Privacy and clears the Better Auth session', async ({
    page,
  }) => {
    await openAccountSettings(page);

    await page.getByTestId('account-logout-button').click();
    await confirmGlobalDialog(page);
    await page.waitForURL((url) => url.pathname === '/auth', {
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    const sessionResponse = await page.request.get('/api/auth/get-session');
    expect(sessionResponse.ok()).toBe(true);
    const session = await sessionResponse.json();
    expect(session?.session ?? null).toBeNull();
  });
});
