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
    // The selected file is previewed from a short-lived object URL until Save.
    await expect(preview).toHaveAttribute('src', /^blob:/, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('profile-editor-avatar')).toHaveAttribute('aria-busy', 'false');

    const nicknameInput = page.getByTestId('profile-editor-nickname');
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

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openProfileEditor(page);

    // After the reload the object URL is gone, so a rendered image proves the
    // saved avatar was persisted and loaded again.
    const persistedAvatar = page.getByTestId('profile-editor-avatar').locator('img');
    await expect(persistedAvatar).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(persistedAvatar).toHaveAttribute('src', /\S+/);
  });

  test('[P1] keeps the cloud identity email visible but outside the editable profile fields', async ({
    page,
    workerAccount,
  }) => {
    const masked = workerAccount.email.replace(/^(.).*(@.*)$/, '$1***$2');
    const identityEmail = page.getByTestId('account-login-email');
    await expect(identityEmail).toBeVisible();
    await expect(identityEmail).toHaveText(masked);
    // Changing the identity email goes through the verification dialog, so the
    // card only ever shows the masked address as read-only text.
    await expect(page.getByTestId('account-change-email')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    // Profile fields live in the edit dialog, never inline on the settings card.
    await expect(page.locator('#nickname,#bio')).toHaveCount(0);
    await expect(page.getByTestId('profile-editor-dialog')).toHaveCount(0);
    await expect(page.getByTestId('account-settings-nickname')).toBeVisible();
    await expect(page.getByTestId('account-settings-profile-edit')).toBeVisible();
  });
});
