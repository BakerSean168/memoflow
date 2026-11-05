import { expect, test } from '../helpers/fixtures';
import { TIMEOUT_CONFIG } from '../config';
import { openAccountSettingsForSession } from './account-settings.helpers';

test.describe('Account profile canonical surface', () => {
  test.beforeEach(async ({ page, testData }) => {
    // Profile fields are account-level state. Restore the empty profile a new
    // registration used to provide before every case reuses the worker session.
    await testData.resetAccountProfile();
    await openAccountSettingsForSession(page);
  });

  test('[P0] redirects the legacy account-center deep link into Account & Privacy settings', async ({
    page,
  }) => {
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

  test('[P0] uploads a local avatar instead of exposing an avatar URL field', async ({ page }) => {
    // 1×1 PNG: the upload path normalizes and re-encodes it before persisting.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    );
    await expect(page.locator('#avatar')).toHaveCount(0);

    await page.getByTestId('account-profile-avatar-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: png,
    });

    const preview = page.getByTestId('account-profile-avatar').locator('img');
    await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,/, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-profile-nickname')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('account-profile-avatar').locator('img')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
  });

  test('[P1] keeps the cloud identity email visible but outside the editable profile fields', async ({
    page,
    workerAccount,
  }) => {
    await expect(page.getByTestId('account-center-view')).toContainText(workerAccount.email);
    await expect(page.locator('input[type="email"]')).toHaveCount(1);
    await expect(page.getByTestId('cloud-password-forgot-email')).toHaveValue(workerAccount.email);
    await expect(page.locator('#nickname')).toBeEditable();
    await expect(page.getByTestId('account-profile-avatar')).toBeEnabled();
    await expect(page.locator('#bio')).toBeEditable();

    // Cloud Auth owns the login email; Account profile editing intentionally has no email field.
    await expect(page.locator('#email')).toHaveCount(0);
  });
});
