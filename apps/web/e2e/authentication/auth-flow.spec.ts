import { test, expect, type Page } from '@playwright/test';
import { ensureLoginScene, login, registerViaAuth } from '../helpers/testHelpers';
import { WEB_CONFIG, TIMEOUT_CONFIG } from '../config';

const generateTestEmail = () =>
  `e2e-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Authentication Flow - 认证完整流程', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthPage(page);
  });

  test('[P0] 完整流程：注册 → 登出 → 再次登录', async ({ page }) => {
    const testEmail = generateTestEmail();

    await registerViaAuth(page, testEmail, testPassword);
    await expectAuthenticated(page);

    await logoutFromAccountCenter(page);
    await expectOnAuthPage(page);

    await login(page, testEmail, testPassword);
    await expectAuthenticated(page);
  });

  test('[P0] 注册：应该成功注册新用户', async ({ page }) => {
    const testEmail = generateTestEmail();

    await registerViaAuth(page, testEmail, testPassword);
    await expectAuthenticated(page);
  });

  test('[P1] 登录：应该拒绝错误的密码', async ({ page }) => {
    const testEmail = generateTestEmail();

    await registerViaAuth(page, testEmail, testPassword);
    await expectAuthenticated(page);

    await logoutFromAccountCenter(page);
    await expectOnAuthPage(page);

    await fillLoginForm(page, testEmail, 'WrongPass123!');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByText(/incorrect email or password|邮箱或密码错误/i).first()).toBeVisible(
      {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      },
    );
    await expectOnAuthPage(page);
  });
});

async function gotoAuthPage(page: Page): Promise<void> {
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

async function fillLoginForm(page: Page, email: string, password: string): Promise<void> {
  await ensureLoginScene(page);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
}

async function logoutFromAccountCenter(page: Page): Promise<void> {
  await page.goto(WEB_CONFIG.getFullUrl('/account/center'), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });

  await expect(page.getByTestId('account-center-view')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await page.getByTestId('account-logout-button').click();
  const confirmDialog = page.getByRole('alertdialog', {
    name: /log out of your account|确认退出登录/i,
  });
  await expect(confirmDialog).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await confirmDialog.getByRole('button', { name: /log out|退出登录/i }).click();
}

async function expectAuthenticated(page: Page): Promise<void> {
  await page.waitForURL((url) => !url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
    timeout: TIMEOUT_CONFIG.LOGIN,
  });
  await page.waitForLoadState('domcontentloaded');
}

async function expectOnAuthPage(page: Page): Promise<void> {
  await page.waitForURL((url) => url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
    timeout: TIMEOUT_CONFIG.LOGIN,
  });
  await ensureLoginScene(page);
  await expect(page.locator('#email')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}
