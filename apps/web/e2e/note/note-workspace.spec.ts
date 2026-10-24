import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/auth-api';

const testPassword = 'Test123456!';

test.describe('Knowledge repository workspace', () => {
  test('[P0] presents the projection-only connection boundary to a new account', async ({
    page,
  }) => {
    await registerAndLogin(page, {
      email: `e2e-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      password: testPassword,
      landingPath: '/repository',
    });

    await expect(page.getByTestId('knowledge-projection-workspace')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('knowledge-projection-empty')).toBeVisible();
    await expect(page.getByTestId('knowledge-projection-connect')).toBeVisible();

    await expect(page.locator('.cm-content')).toHaveCount(0);
    await expect(page.locator('[data-primary-action="create-note"]')).toHaveCount(0);
  });
});
