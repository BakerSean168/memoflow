import { expect, test, type Page } from '@playwright/test';
import { ensureLoginScene, login, registerViaAuth } from '../helpers/testHelpers';
import { waitForCapturedEmailLink } from '../helpers/auth-email-link';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';

const oldPassword = 'Test123456!';
const newPassword = 'NewTest654321!';

function generateTestEmail(): string {
  return `e2e-reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function gotoCleanAuthPage(page: Page): Promise<void> {
  await page.goto(WEB_CONFIG.getFullUrl(WEB_CONFIG.LOGIN_PATH), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
  await ensureLoginScene(page);
}

test.describe('Authentication - password recovery', () => {
  test('[P0] forgot → link → reset → old password fails → new password works → token replay fails', async ({
    page,
  }) => {
    const email = generateTestEmail();
    await gotoCleanAuthPage(page);
    await registerViaAuth(page, email, oldPassword);

    await gotoCleanAuthPage(page);
    await page.getByTestId('login-forgot-link').click();
    await expect(page.getByTestId('forgot-form')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await page.locator('#forgot-email').fill(email);
    await page.getByTestId('forgot-submit-button').click();
    const link = await waitForCapturedEmailLink(email, 'password-reset');
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('reset-form')).toBeVisible();
    const resetUrl = page.url();
    await page.locator('#new-password').fill(newPassword);
    await page.locator('#confirm-new-password').fill(newPassword);
    await page.getByTestId('reset-submit-button').click();

    await expect(page.getByTestId('login-form')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    // Old password must fail.
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(oldPassword);
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByText(/incorrect email or password|邮箱或密码错误/i).first()).toBeVisible(
      {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      },
    );

    // New password succeeds.
    await login(page, email, newPassword);
    await page.waitForURL((url) => !url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
      timeout: TIMEOUT_CONFIG.LOGIN,
    });

    // Replay the consumed token through the same callback URL.
    await page.goto(resetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('reset-form')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await page.locator('#new-password').fill(`${newPassword}X`);
    await page.locator('#confirm-new-password').fill(`${newPassword}X`);
    await page.getByTestId('reset-submit-button').click();
    // The consumed token replay fails via the unified password-mutation
    // receipt (W6): a structured, localized error banner with retry.
    await expect(page.getByTestId('web-auth-password-receipt')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });
});
