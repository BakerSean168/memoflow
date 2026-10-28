import { expect, test } from '../helpers/fixtures';
import { TIMEOUT_CONFIG } from '../config';

test.describe('Global command palette', () => {
  test.beforeEach(async ({ page }) => {
    // The worker session is already authenticated; only the shell landing that
    // the old registration flow performed remains.
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await page.getByTestId('app-shell').waitFor({
      state: 'visible',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  });

  test('[P1] opens from Ctrl+K, focuses the command input, and closes with Escape', async ({
    page,
  }) => {
    await page.keyboard.press('Control+K');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(dialog).toHaveAccessibleName(/^(命令面板|Command palette)$/);
    await expect(dialog).toHaveAccessibleDescription(/搜索并执行命令|Search for a command to run/);
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
