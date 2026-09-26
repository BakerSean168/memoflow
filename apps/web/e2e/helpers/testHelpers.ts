import { Page } from '@playwright/test';
import { API_CONFIG, WEB_CONFIG, TIMEOUT_CONFIG, TEST_USERS } from '../config';
import { completeEmailVerification } from './auth-email-link';

/**
 * Legacy umbrella helpers for the classic web E2E suite.
 * New sync-specific flows should prefer the focused helpers under `e2e/sync/helpers`.
 */

/**
 * ========================================
 * 测试用户配置
 * ========================================
 *
 * 默认用户定义集中在 `apps/web/e2e/config.ts`。
 * 如果账号准备方式变化，应优先更新配置和相关脚本，而不是在这里重复维护。
 *
 * 配置来源: /apps/web/e2e/config.ts
 */

/** Canonical test users: import { TEST_USERS } from '../config'. */

export type RegisterAndLoginOptions = {
  email?: string;
  password?: string;
  landingPath?: string;
};

const AUTH_SCENE_LINK_TEXT = {
  register: /sign up|立即注册|注册/i,
  login: /back to sign in|返回登录/i,
} as const;

function resolveLoginEmail(identityOrEmail: string): string {
  if (identityOrEmail.includes('@')) {
    return identityOrEmail;
  }

  const knownUser = Object.values(TEST_USERS).find(
    (user) => user.username === identityOrEmail || user.email === identityOrEmail,
  );

  return knownUser?.email ?? identityOrEmail;
}

function createSelfRegisterEmail(): string {
  return `e2e-self-register-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function openAuthPage(page: Page): Promise<void> {
  const loginUrl = WEB_CONFIG.getFullUrl(WEB_CONFIG.LOGIN_PATH);
  await page.goto(loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  });
}

async function prepareAuthPage(page: Page): Promise<void> {
  await openAuthPage(page);
  await clearAuthState(page);
  console.log('[Auth] 已清理旧的认证状态');
  // Avoid networkidle: Vite HMR / long-polling can keep the network busy forever.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
  // Residual 1335: auth bundle cold load can exceed ELEMENT_WAIT under serial e2e pressure.
  await page
    .locator(
      '#email, #reg-email, [data-testid="register-submit-button"], button:has-text("Sign In")',
    )
    .first()
    .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.AUTH_BOOTSTRAP });
  await page.waitForTimeout(TIMEOUT_CONFIG.SHORT_WAIT);
}

async function isVisible(locator: ReturnType<Page['locator']>): Promise<boolean> {
  return await locator.isVisible().catch(() => false);
}

export async function ensureRegisterScene(page: Page): Promise<void> {
  const registerEmailField = page.locator('#reg-email');
  if (await isVisible(registerEmailField)) {
    return;
  }

  const registerLink = page.getByRole('button', { name: AUTH_SCENE_LINK_TEXT.register });
  const visibleScene = await Promise.race([
    registerEmailField
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.AUTH_BOOTSTRAP })
      .then(() => 'register' as const),
    registerLink
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.AUTH_BOOTSTRAP })
      .then(() => 'login' as const),
  ]);
  if (visibleScene === 'register') {
    return;
  }

  await registerLink.click();
  await registerEmailField.waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

export async function ensureLoginScene(page: Page): Promise<void> {
  const loginEmailField = page.locator('#email');
  if (await isVisible(loginEmailField)) {
    return;
  }

  const loginLink = page.getByRole('button', { name: AUTH_SCENE_LINK_TEXT.login });
  const visibleScene = await Promise.race([
    loginEmailField
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.AUTH_BOOTSTRAP })
      .then(() => 'login' as const),
    loginLink
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.AUTH_BOOTSTRAP })
      .then(() => 'register' as const),
  ]);
  if (visibleScene === 'login') {
    return;
  }

  await loginLink.click();
  await loginEmailField.waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

/**
 * Residual 1335: after leaving `/auth`, the main Vite graph mounts into `#app`
 * and replaces `#startup-splash`. Cold first paint often exceeds ELEMENT_WAIT (10s).
 * Wait for the authenticated shell before callers assert route-specific testids.
 */
async function waitForAuthenticatedShell(page: Page): Promise<void> {
  await page.getByTestId('app-shell').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

async function navigateAfterAuth(page: Page, landingPath?: string): Promise<void> {
  if (!landingPath) {
    await page.waitForLoadState('domcontentloaded');
    await waitForAuthenticatedShell(page);
    return;
  }

  if (page.url() !== WEB_CONFIG.getFullUrl(landingPath)) {
    await page.goto(WEB_CONFIG.getFullUrl(landingPath), {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  } else {
    await page.waitForLoadState('domcontentloaded');
  }

  await waitForAuthenticatedShell(page);
}

async function registerViaAuth(page: Page, email: string, password: string): Promise<void> {
  await ensureRegisterScene(page);

  await page.locator('#reg-email').fill(email);
  await page.locator('#reg-password').fill(password);
  await page.locator('#confirm-password').fill(password);

  // The test mail capture is written before the sign-up response necessarily
  // reaches the browser. Wait for the auth transaction to commit before using
  // its verification link; otherwise the verification endpoint can observe a
  // user that has not been persisted yet.
  const signUpResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/sign-up/email') && response.request().method() === 'POST',
    { timeout: TIMEOUT_CONFIG.API_REQUEST },
  );
  await page.getByTestId('register-submit-button').click();
  const signUpResponse = await signUpResponsePromise;
  if (!signUpResponse.ok()) {
    throw new Error(`Registration failed with HTTP ${signUpResponse.status()}`);
  }
  await completeEmailVerification(page, email, password);
}

export async function registerAndLogin(
  page: Page,
  options: RegisterAndLoginOptions = {},
): Promise<void> {
  const email = options.email ?? createSelfRegisterEmail();
  const password = options.password ?? TEST_USERS.MAIN.password;

  console.log(`[Auth] 开始自注册认证: ${email}`);
  console.log(`[Auth] 使用配置 - API: ${API_CONFIG.FULL_URL}, Web: ${WEB_CONFIG.BASE_URL}`);

  await prepareAuthPage(page);
  await registerViaAuth(page, email, password);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(TIMEOUT_CONFIG.MEDIUM_WAIT);
  await navigateAfterAuth(page, options.landingPath);

  console.log('[Auth] 自注册认证成功');
}

/**
 * 测试数据工厂
 */
export function createTestTask(
  title: string,
  options?: {
    description?: string;
    duration?: number;
    status?: 'pending' | 'in-progress' | 'completed' | 'blocked';
  },
) {
  return {
    title,
    description: options?.description || `Test description for ${title}`,
    duration: options?.duration || 60,
    status: options?.status || 'pending',
  };
}

export function createTestGoal(
  title: string,
  options?: {
    description?: string;
    deadline?: string;
  },
) {
  return {
    title,
    description: options?.description || `Test goal: ${title}`,
    deadline: options?.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * 登录辅助函数
 */
export async function login(
  page: Page,
  identityOrEmail: string = TEST_USERS.MAIN.email,
  password: string = TEST_USERS.MAIN.password,
) {
  const email = resolveLoginEmail(identityOrEmail);

  console.log(`[Auth] 开始登录: ${email}`);
  console.log(`[Auth] 使用配置 - API: ${API_CONFIG.FULL_URL}, Web: ${WEB_CONFIG.BASE_URL}`);

  await prepareAuthPage(page);

  // 显式切回登录 scene，避免 auth 页面默认停在注册态时造成误判。
  await ensureLoginScene(page);

  // ===== 填写用户名 =====
  console.log('[Auth] 查找用户名输入框...');
  const emailField = page.locator('#email');

  await emailField.waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await emailField.click();
  await emailField.fill(email);
  console.log(`[Auth] 已填写邮箱: ${email}`);

  // ===== 填写密码 =====
  console.log('[Auth] 查找密码输入框...');
  const passwordField = page.locator('#password');

  await passwordField.waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await passwordField.click();
  await passwordField.fill(password);
  console.log('[Auth] 已填写密码');

  // ===== 点击登录按钮 =====
  console.log('[Auth] 点击登录按钮...');
  const loginButton = page.getByTestId('login-submit-button');
  await loginButton.waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await loginButton.click();

  // ===== 等待登录完成 =====
  console.log('[Auth] 等待登录完成...');

  // 等待离开 /auth 页面 或者 等待特定元素出现表示登录成功
  try {
    // 方式1: 等待 URL 变化（离开 /auth）
    await page.waitForURL((url) => !url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
      timeout: TIMEOUT_CONFIG.LOGIN,
    });
    console.log('[Auth] 已离开登录页面');
  } catch {
    // 方式2: 检查当前 auth 页的错误横幅
    const errorBanner = page.getByText(/incorrect email or password|邮箱或密码错误/i).first();
    if (await errorBanner.isVisible().catch(() => false)) {
      const errorText = await errorBanner.textContent();
      console.warn(`[Auth] 登录失败，尝试注册测试账号: ${errorText}`);
      await registerViaAuth(page, email, password);
      await page.waitForLoadState('domcontentloaded');
      return;
    }

    const serviceError = page
      .getByText(/temporarily unavailable|认证服务暂不可用|认证服务异常|authentication failed/i)
      .first();
    const serviceErrorText = await serviceError.textContent().catch(() => null);
    throw new Error(serviceErrorText ?? `Login did not leave ${WEB_CONFIG.LOGIN_PATH}`);
  }

  // 等待页面稳定
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(TIMEOUT_CONFIG.MEDIUM_WAIT);
  // Residual 1335: main shell cold mount after login (same as registerAndLogin).
  await waitForAuthenticatedShell(page);

  console.log('[Auth] 登录成功');
}

/**
 * ========================================
 * Task Module Helpers
 * ========================================
 */

/**
 * 导航到 Task 页面
 */

export async function navigateToTasks(page: Page) {
  console.log('[Navigation] 导航到 Task 页面（V2 shell: /tasks 业务面板）');

  try {
    // V2: 任务库路由是 /tasks（已无 /tasks/one-time）
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('business-panel').waitFor({
      state: 'visible',
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  } catch (error) {
    console.log('[Navigation] 直达失败，尝试胶囊导航:', error);
    // 方式2: 顶部模块胶囊（取代 V1 侧栏链接）
    const capsule = page.getByTestId('capsule-nav-task');
    if (await capsule.count()) {
      await capsule.click();
    } else {
      await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForURL(/\/tasks/);
    await page.getByTestId('business-panel').waitFor({
      state: 'visible',
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  }

  console.log('[Navigation] 已到达 Task 页面 (/tasks)');
}

/**
 * 创建 Task
 */
export async function createTask(
  page: Page,
  taskData: {
    title: string;
    description?: string;
    duration?: number;
    status?: string;
  },
) {
  console.log(`[Task] 创建任务: ${taskData.title}`);

  // 点击创建按钮
  await page.click(
    'button:has-text("创建"), button:has-text("新建"), button:has-text("Create Task")',
  );

  // 等待表单弹窗
  await page.waitForSelector('form, [role="dialog"]', { timeout: 5000 });

  // 填写标题
  await page.fill(
    'input[name="title"], input[placeholder*="标题"], input[label*="标题"]',
    taskData.title,
  );

  // 填写描述
  if (taskData.description) {
    await page.fill(
      'textarea[name="description"], textarea[placeholder*="描述"]',
      taskData.description,
    );
  }

  // 填写时长
  if (taskData.duration !== undefined) {
    await page.fill('input[name="duration"], input[type="number"]', taskData.duration.toString());
  }

  // 提交表单
  await page.click('button[type="submit"], button:has-text("确定"), button:has-text("保存")');

  // 等待创建成功
  await page.waitForTimeout(1000);

  console.log('[Task] 任务创建成功');
}

/**
 * 清理测试任务
 */
export async function cleanupTask(page: Page, taskTitle: string) {
  console.log(`[Cleanup] 清理测试任务: ${taskTitle}`);

  try {
    await navigateToTasks(page);

    const taskCard = page.locator(`[data-testid="task-plan-card"]:has-text("${taskTitle}")`);

    if ((await taskCard.count()) > 0) {
      // 点击删除按钮
      await taskCard.locator('button:has-text("删除"), button[aria-label*="删除"]').click();

      // 确认删除
      await page.click('button:has-text("确定"), button:has-text("确认")');

      await page.waitForTimeout(1000);
      console.log('[Cleanup] 清理成功');
    }
  } catch (error) {
    console.log('[Cleanup] 清理失败:', error);
  }
}

/**
 * ========================================
 * Command Palette Helpers
 * ========================================
 */

/**
 * 打开命令面板
 */
export async function openCommandPalette(page: Page) {
  console.log('[CommandPalette] 打开命令面板');

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+KeyK`);

  // 等待命令面板出现
  await page.waitForSelector('[data-testid="command-palette"]', { timeout: 3000 });
  await page.waitForTimeout(300);

  console.log('[CommandPalette] 命令面板已打开');
}

/**
 * 在命令面板中搜索
 */
export async function searchInCommandPalette(page: Page, query: string) {
  console.log(`[CommandPalette] 搜索: "${query}"`);

  const searchInput = page.getByTestId('command-palette-input');
  await searchInput.fill(query);
  await page.waitForTimeout(300); // Debounce

  console.log('[CommandPalette] 搜索完成');
}

/**
 * 关闭命令面板
 */
export async function closeCommandPalette(page: Page) {
  console.log('[CommandPalette] 关闭命令面板');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
