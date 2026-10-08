import { test, expect, type Page } from '@playwright/test';
import { ensureLoginScene, ensureRegisterScene, registerViaAuth } from '../helpers/testHelpers';
import { WEB_CONFIG, TIMEOUT_CONFIG } from '../config';

const generateTestEmail = () =>
  `e2e-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Authentication - 登录页基础验证', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthPage(page);
  });

  test('[P0] 正确凭证可以成功登录', async ({ page }) => {
    const testEmail = generateTestEmail();

    await registerViaAuth(page, testEmail, testPassword);
    await expectAuthenticated(page);

    await logoutFromAccountCenter(page);
    await expectOnAuthPage(page);

    await fillLoginForm(page, testEmail, testPassword);
    await submitLoginForm(page);

    await expectAuthenticated(page);

    const authState = await readAuthState(page);
    expect(authState.hasSession).toBe(true);
    expect(authState.hasPersistedBearerCredential).toBe(false);
  });

  test('[P0] 错误凭证会显示错误提示', async ({ page }) => {
    const testEmail = generateTestEmail();

    await registerViaAuth(page, testEmail, testPassword);
    await expectAuthenticated(page);

    await logoutFromAccountCenter(page);
    await expectOnAuthPage(page);

    await fillLoginForm(page, testEmail, 'WrongPass123!');
    await submitLoginForm(page);

    await expect(page.getByText(/incorrect email or password|邮箱或密码错误/i).first()).toBeVisible(
      {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      },
    );
    await expect.poll(async () => page.url()).toContain(WEB_CONFIG.LOGIN_PATH);
  });

  test('[P1] 可以在登录和注册表单间切换', async ({ page }) => {
    await ensureRegisterScene(page);
    await expect(page.locator('#reg-email')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    await ensureLoginScene(page);
    await expect(page.locator('#email')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
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

async function openLoginTab(page: Page): Promise<void> {
  await ensureLoginScene(page);
  await expect(page.locator('#email')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

async function fillLoginForm(page: Page, email: string, password: string): Promise<void> {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
}

async function submitLoginForm(page: Page): Promise<void> {
  await page.getByTestId('login-submit-button').click();
}

async function expectAuthenticated(page: Page): Promise<void> {
  await page.waitForURL((url) => !url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
    timeout: TIMEOUT_CONFIG.LOGIN,
  });
  await page.waitForLoadState('domcontentloaded');
}

async function readAuthState(page: Page): Promise<{
  hasSession: boolean;
  hasPersistedBearerCredential: boolean;
}> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session', { credentials: 'include' });
    const session = response.ok ? await response.json() : null;
    const storage = `${JSON.stringify(localStorage)} ${JSON.stringify(sessionStorage)}`;
    return {
      hasSession: Boolean(session?.session && session?.user),
      hasPersistedBearerCredential: /accessToken|refreshToken|access_token|refresh_token/.test(
        storage,
      ),
    };
  });
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

async function expectOnAuthPage(page: Page): Promise<void> {
  await page.waitForURL((url) => url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
    timeout: TIMEOUT_CONFIG.LOGIN,
  });
  await openLoginTab(page);
}
