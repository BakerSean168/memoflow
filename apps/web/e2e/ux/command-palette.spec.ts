import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

function createCommandPaletteAuditEmail(): string {
  return `e2e-command-palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

test.describe('Global command palette', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, {
      email: createCommandPaletteAuditEmail(),
      password: 'Test123456!',
      landingPath: '/',
    });
  });

  test('[P1] opens from Ctrl+K, focuses the command input, and closes with Escape', async ({
    page,
  }) => {
    await page.keyboard.press('Control+K');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(dialog.locator('input').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  });

  test('[P2] toggles the same global surface with repeated Ctrl+K', async ({ page }) => {
    const dialog = page.getByRole('dialog');

    await page.keyboard.press('Control+K');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    await page.keyboard.press('Control+K');
    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  });
});
