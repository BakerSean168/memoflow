import { test, expect } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { createAccountAuditEmail, openAccountSettings } from './account-settings.helpers';

test.describe('Account profile canonical surface', () => {
  test('[P0] redirects the legacy account-center deep link into Account & Privacy settings', async ({
    page,
  }) => {
    await openAccountSettings(page);

    await page.goto('/account/center', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    await expect(page).toHaveURL(/\/settings\?tab=account(?:&|$)/, {
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('account-settings-section')).toBeVisible();
    await expect(page.getByTestId('account-center-view')).toBeVisible();
  });

  test('[P0] persists profile avatar URL and bio on the canonical account owner', async ({
    page,
  }) => {
    await openAccountSettings(page);

    const avatar = 'https://example.com/audit-avatar.png';
    const bio = `Nightly audit bio ${Date.now()}`;
    await page.locator('#avatar').fill(avatar);
    await page.locator('#bio').fill(bio);

    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.endsWith('/api/v1/accounts/me'),
      { timeout: TIMEOUT_CONFIG.API_REQUEST },
    );
    await page.getByTestId('account-profile-save').click();
    expect((await updateResponse).ok()).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#avatar')).toHaveValue(avatar, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.locator('#bio')).toHaveValue(bio);
  });

  test('[P1] keeps the cloud identity email visible but outside the editable profile fields', async ({
    page,
  }) => {
    const email = createAccountAuditEmail('e2e-account-identity');
    await openAccountSettings(page, { email });

    await expect(page.getByTestId('account-center-view')).toContainText(email);
    await expect(page.locator('input[type="email"]')).toHaveCount(1);
    await expect(page.getByTestId('cloud-password-forgot-email')).toHaveValue(email);
    await expect(page.locator('#nickname')).toBeEditable();
    await expect(page.locator('#avatar')).toBeEditable();
    await expect(page.locator('#bio')).toBeEditable();

    // Cloud Auth owns the login email; Account profile editing intentionally has no email field.
    await expect(page.locator('#email')).toHaveCount(0);
  });
});
