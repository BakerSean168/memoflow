import { expect, test } from '../helpers/fixtures';
import { TIMEOUT_CONFIG } from '../config';
import { openAccountSettingsForSession, openProfileEditor } from './account-settings.helpers';

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
    await openProfileEditor(page);

    await page.getByTestId('profile-editor-avatar-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: png,
    });

    const preview = page.getByTestId('profile-editor-avatar').locator('img');
    await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,/, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openProfileEditor(page);
    await expect(page.getByTestId('profile-editor-avatar').locator('img')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
  });

  test('[P1] keeps the cloud identity email visible but outside the editable profile fields', async ({
    page,
    workerAccount,
  }) => {
    const masked = workerAccount.email.replace(/^(.).*(@.*)$/, '$1***$2');
    await expect(page.getByTestId('account-login-email')).toHaveText(masked);
    await expect(page.getByTestId('cloud-password-reset-recipient')).toHaveText(masked);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('#nickname,#bio')).toHaveCount(0);
    await expect(page.getByTestId('account-profile-avatar')).toHaveCount(0);
    await expect(page.getByTestId('account-profile-save')).toHaveCount(0);
  });
});
