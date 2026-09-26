import { expect, test, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { ensureLoginScene, ensureRegisterScene } from '../helpers/testHelpers';

const testPassword = 'Test123456!';

test.describe('Web authentication page contract', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCleanAuthPage(page);
  });

  test('[P0] uses a fixed brand theme, one h1, and real form semantics', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'presentation-preference',
        JSON.stringify({ locale: 'en-US', theme: 'light' }),
      );
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem('presentation-preference') ?? '{}'),
      ),
    ).toMatchObject({ theme: 'light' });
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('login-submit-button')).toHaveAttribute('type', 'submit');
    await expect(page.getByTestId('auth-language-selector')).toHaveAttribute(
      'aria-label',
      'Interface language',
    );
    await expect(page.getByTestId('guest-mode-button')).toHaveCount(0);
    // ADR-034 three-login: Web AuthApp has password (+ optional GitHub), never guest/phone/SMS.
    await expect(page.getByTestId('login-password-input')).toBeVisible();
    await expect(page.locator('[data-testid="login-phone-input"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="send-sms-code-button"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="login-phone-button"]')).toHaveCount(0);
    await expect(page.getByTestId('login-forgot-link')).toBeVisible();
    await expect(page.getByTestId('auth-legal-footer')).toBeVisible();
    await expect(page.getByTestId('auth-terms-link')).toBeVisible();
    await expect(page.getByTestId('auth-privacy-link')).toBeVisible();
    await expect(page.getByTestId('auth-terms-link')).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('auth-privacy-link')).toHaveAttribute('target', '_blank');

    await ensureRegisterScene(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /create your .* account|创建.*账号/i,
    );
    await expect(page.getByTestId('register-form')).toBeVisible();
    await expect(page.getByTestId('register-submit-button')).toHaveAttribute('type', 'submit');
  });

  test('[P0] validates every registration field, focuses the first error, and clears resolved errors', async ({
    page,
  }) => {
    await ensureRegisterScene(page);
    await page.getByTestId('register-submit-button').click();

    await expect(page.getByTestId('register-email-error')).toBeVisible();
    await expect(page.getByTestId('register-password-error')).toBeVisible();
    await expect(page.getByTestId('register-confirm-password-error')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeFocused();
    await expect(page.locator('#reg-email')).toHaveAttribute('aria-invalid', 'true');

    await page.locator('#reg-email').fill('invalid-email');
    await page.locator('#reg-password').fill('short');
    await page.locator('#confirm-password').fill('different');
    await page.getByTestId('register-submit-button').click();
    await expect(page.getByTestId('register-email-error')).toContainText(/valid email|有效的邮箱/i);
    await expect(page.getByTestId('register-password-error')).toContainText(/8 characters|8 位/i);
    await expect(page.getByTestId('register-confirm-password-error')).toContainText(
      /do not match|不一致/i,
    );

    const passwordOverLimit = `A1${'a'.repeat(99)}`;
    await page.locator('#reg-password').fill(passwordOverLimit);
    await page.locator('#confirm-password').fill(passwordOverLimit);
    await page.getByTestId('register-submit-button').click();
    await expect(page.getByTestId('register-password-error')).toContainText(
      /100 characters|100 位/i,
    );

    const email = `e2e-auth-form-${Date.now()}@test.com`;
    await page.locator('#reg-email').fill(email);
    await expect(page.getByTestId('register-email-error')).toHaveCount(0);
    await page.locator('#reg-password').fill(testPassword);
    await expect(page.getByTestId('register-password-error')).toHaveCount(0);
    await page.locator('#confirm-password').fill(testPassword);
    await expect(page.getByTestId('register-confirm-password-error')).toHaveCount(0);

    await page.locator('#confirm-password').press('Enter');
    await expect(page.getByTestId('verify-email-form')).toBeVisible({
      timeout: TIMEOUT_CONFIG.LOGIN,
    });
  });

  test('[P0] retranslates the current stable server error when language changes', async ({
    page,
  }) => {
    await page.getByTestId('auth-locale-zh-CN').click();
    await page.locator('#email').fill(`missing-${Date.now()}@test.com`);
    await page.locator('#password').fill(testPassword);
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('auth-error-banner');
    await expect(errorBanner).toContainText('邮箱或密码错误', {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await page.getByTestId('auth-locale-en-US').click();
    await expect(errorBanner).toContainText('Incorrect email or password');

    await page.locator('#email').fill(`corrected-${Date.now()}@test.com`);
    await expect(errorBanner).toHaveCount(0);
  });

  test('[P1] login form validates locally and follows visual focus order', async ({ page }) => {
    await ensureLoginScene(page);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('login-email-error')).toBeVisible();
    await expect(page.getByTestId('login-password-error')).toBeVisible();
    await expect(page.locator('#email')).toBeFocused();
    await page.locator('#email').fill('person@example.com');
    await expect(page.getByTestId('login-email-error')).toHaveCount(0);
    await page.getByTestId('login-submit-button').click();
    await expect(page.locator('#password')).toBeFocused();
  });

  test('[P1] keeps every registration field reachable on a small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await ensureRegisterScene(page);
    await page.getByTestId('register-submit-button').click();

    await expect(page.getByTestId('register-confirm-password-error')).toBeVisible();
    await page.getByTestId('register-submit-button').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('register-submit-button')).toBeVisible();
    const pageMetrics = await page.getByTestId('web-auth-page').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    }));
    expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth + 1);
    expect(pageMetrics.scrollHeight).toBeGreaterThan(640);
  });
});

async function gotoCleanAuthPage(page: Page): Promise<void> {
  // Playwright creates a fresh BrowserContext for every test in this project, so
  // local/session storage already starts empty. Avoid a second immediate reload:
  // with Vite's native-ESM E2E server that aborts the first module graph while it
  // is still warming and can turn a normal cold start into a 30s+ splash stall.
  await page.context().clearCookies();
  await page.goto(WEB_CONFIG.getFullUrl(WEB_CONFIG.LOGIN_PATH), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await ensureLoginScene(page);
}
