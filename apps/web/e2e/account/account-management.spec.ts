import { test, expect } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import {
  ACCOUNT_TEST_PASSWORD,
  confirmGlobalDialog,
  createAccountAuditEmail,
  openAccountSettings,
  openProfileEditor,
} from './account-settings.helpers';
import { waitForCapturedEmailCode } from '../helpers/auth-email-link';

test.describe('Account & Privacy settings', () => {
  test('[P1] renders account security without personal profile fields', async ({ page }) => {
    const email = createAccountAuditEmail('e2e-account-profile');
    await openAccountSettings(page, { email });

    await expect(page.getByTestId('account-login-email')).toHaveText(
      email.replace(/^(.).*(@.*)$/, '$1***$2'),
    );
    await expect(page.getByTestId('account-profile-save')).toHaveCount(0);
    await expect(page.getByTestId('cloud-password-open')).toBeVisible();
    await expect(page.getByTestId('account-logout-button')).toBeVisible();
  });

  test('[P1] updates the profile nickname and persists it after refresh', async ({ page }) => {
    await openAccountSettings(page);

    await openProfileEditor(page);
    const nickname = `Audit-${String(Date.now()).slice(-8)}`;
    const nicknameInput = page.getByTestId('profile-editor-nickname');
    await nicknameInput.fill(nickname);
    // The card keeps the save bar hidden until the edit is confirmed with Enter.
    await nicknameInput.press('Enter');
    await expect(page.getByTestId('profile-editor-footer')).toBeVisible();

    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.endsWith('/api/v1/accounts/me'),
      { timeout: TIMEOUT_CONFIG.API_REQUEST },
    );
    await page.getByTestId('profile-editor-save').click();
    expect((await updateResponse).ok()).toBe(true);

    await expect(nicknameInput).toHaveValue(nickname);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openProfileEditor(page);
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue(nickname, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });

  test('[P2] changes the cloud password after verifying the current email', async ({ page }) => {
    const { email } = await openAccountSettings(page);

    const nextPassword = 'NextTest123456!';
    await page.getByTestId('cloud-password-open').click();
    await expect(page.getByTestId('account-email-verification-dialog')).toBeVisible();
    await page.getByTestId('account-verification-send').click();
    await page.getByTestId('account-verification-code').fill(await waitForCapturedEmailCode(email));
    await page.getByTestId('account-verification-verify').click();
    await expect(page.getByTestId('cloud-password-dialog')).toBeVisible();

    await page.getByTestId('cloud-password-current').fill(ACCOUNT_TEST_PASSWORD);
    await page.getByTestId('cloud-password-new').fill(nextPassword);
    await page.getByTestId('cloud-password-confirm').fill(nextPassword);

    const changeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/auth/account-security/change-password'),
      { timeout: TIMEOUT_CONFIG.API_REQUEST },
    );
    await page.getByTestId('cloud-password-change-button').click();
    expect((await changeResponse).ok()).toBe(true);

    await expect(page.getByTestId('cloud-password-dialog')).toHaveCount(0);
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
