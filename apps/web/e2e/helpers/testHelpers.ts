import { Page } from '@playwright/test';
import { API_CONFIG, WEB_CONFIG, TIMEOUT_CONFIG, TEST_USERS } from '../config';
import { completeEmailVerification } from './auth-email-link';

type SSEEventRecord = {
  type: string;
  data: string;
  timestamp: number;
};

type SSEWindowState = Window &
  typeof globalThis & {
    __sse_connected?: boolean;
    __sseEvents?: SSEEventRecord[];
    EventSource: typeof EventSource;
  };

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
    .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.NAVIGATION });
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
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT })
      .then(() => 'register' as const),
    registerLink
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT })
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
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT })
      .then(() => 'login' as const),
    loginLink
      .waitFor({ state: 'visible', timeout: TIMEOUT_CONFIG.ELEMENT_WAIT })
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
 * Materialize the effective default settings for a freshly registered account.
 * Settings are created lazily by GET /settings, while reset/export tests require
 * a persisted singleton as their fixture precondition.
 */
export async function ensureUserSettingsRecord(page: Page): Promise<void> {
  const response = await page.evaluate(async (apiBaseUrl) => {
    const result = await fetch(`${apiBaseUrl}/settings`, {
      credentials: 'include',
    });
    return { ok: result.ok, status: result.status };
  }, API_CONFIG.API_PREFIX);

  if (!response.ok) {
    throw new Error(`Failed to prepare user settings (HTTP ${response.status})`);
  }
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
 * 等待 SSE 连接建立
 */
export async function waitForSSEConnection(page: Page, timeout: number = 10000) {
  console.log('[SSE] 等待 SSE 连接建立...');

  // 等待 EventSource 连接
  await page.waitForFunction(
    () => {
      const sseWindow = window as SSEWindowState;
      return sseWindow.__sse_connected === true;
    },
    { timeout },
  );

  console.log('[SSE] SSE 连接已建立');
}

/**
 * 监听 SSE 事件
 */
export async function captureSSEEvents(page: Page): Promise<void> {
  // Patch EventSource in the page context so tests can assert transport-level
  // delivery without coupling to a specific toast or notification widget.
  await page.evaluate(() => {
    const sseWindow = window as SSEWindowState;

    // 保存原始 EventSource
    const OriginalEventSource = sseWindow.EventSource;

    // 创建事件收集器
    sseWindow.__sseEvents = [];

    // 重写 EventSource
    sseWindow.EventSource = class extends OriginalEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);

        const pushEvent = (event: SSEEventRecord) => {
          sseWindow.__sseEvents ??= [];
          sseWindow.__sseEvents.push(event);
        };

        // 监听所有消息
        this.addEventListener('message', (event) => {
          pushEvent({
            type: 'message',
            data: event.data,
            timestamp: Date.now(),
          });
        });

        // 监听特定事件 (reminder, notification 等)
        [
          'reminder',
          'notification',
          'schedule:reminder-triggered',
          'schedule:popup-reminder',
          'schedule:sound-reminder',
        ].forEach((eventType) => {
          this.addEventListener(eventType, (event: MessageEvent<string>) => {
            pushEvent({
              type: eventType,
              data: event.data,
              timestamp: Date.now(),
            });
          });
        });

        // 标记连接状态
        this.addEventListener('open', () => {
          sseWindow.__sse_connected = true;
        });
      }
    };
  });
}

/**
 * 获取捕获的 SSE 事件
 */
export async function getSSEEvents(page: Page): Promise<SSEEventRecord[]> {
  const events = await page.evaluate(() => {
    const sseWindow = window as SSEWindowState;
    return sseWindow.__sseEvents || [];
  });
  return events;
}

/**
 * 清除 SSE 事件记录
 */
export async function clearSSEEvents(page: Page) {
  await page.evaluate(() => {
    const sseWindow = window as SSEWindowState;
    sseWindow.__sseEvents = [];
  });
}

/**
 * 导航到 Reminder 页面
 */
export async function navigateToReminder(page: Page) {
  console.log('[Navigation] 导航到 Reminder 页面（V2 shell 业务面板）');

  try {
    await page.goto('/reminder', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('business-panel').waitFor({
      state: 'visible',
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  } catch {
    const capsule = page.getByTestId('capsule-nav-reminder');
    if (await capsule.count()) {
      await capsule.click();
    } else {
      await page.click('a[href="/reminder"], a:has-text("Reminder"), a:has-text("提醒")');
    }
    await page.waitForURL(/\/reminder/);
  }

  console.log('[Navigation] 已到达 Reminder 页面');
}

/**
 * 创建 Reminder
 */
export async function createReminder(
  page: Page,
  options: {
    name: string;
    content: string;
    intervalMinutes: number;
    enableSound?: boolean;
    enablePopup?: boolean;
  },
) {
  console.log(`[Reminder] 创建提醒: ${options.name} (每 ${options.intervalMinutes} 分钟)`);

  // 点击创建按钮
  await page.click(
    'button:has-text("创建"), button:has-text("新建"), button:has-text("Create"), button[aria-label*="创建"]',
  );

  // 等待表单弹窗
  await page.waitForSelector('form, [role="dialog"]', { timeout: 5000 });

  // 填写名称
  await page.fill(
    'input[name="name"], input[placeholder*="名称"], input[label*="名称"]',
    options.name,
  );

  // 填写内容
  await page.fill(
    'textarea[name="content"], textarea[placeholder*="内容"], input[name="content"]',
    options.content,
  );

  // 设置时间间隔
  // 先选择间隔类型为 "分钟"
  const minuteOption = await page
    .locator('select option:has-text("分钟"), select option:has-text("Minute")')
    .first();
  if ((await minuteOption.count()) > 0) {
    await minuteOption.click();
  }

  // 输入间隔值
  await page.fill(
    'input[type="number"], input[name*="interval"]',
    options.intervalMinutes.toString(),
  );

  // 启用声音提醒
  if (options.enableSound !== false) {
    const soundCheckbox = page
      .locator('input[type="checkbox"][name*="sound"], input[type="checkbox"]:near(:text("声音"))')
      .first();
    if (!(await soundCheckbox.isChecked())) {
      await soundCheckbox.check();
    }
  }

  // 启用弹窗提醒
  if (options.enablePopup !== false) {
    const popupCheckbox = page
      .locator('input[type="checkbox"][name*="popup"], input[type="checkbox"]:near(:text("弹窗"))')
      .first();
    if (!(await popupCheckbox.isChecked())) {
      await popupCheckbox.check();
    }
  }

  // 提交表单
  await page.click(
    'button[type="submit"], button:has-text("确定"), button:has-text("保存"), button:has-text("Create")',
  );

  // 等待创建成功 (表单关闭或出现成功提示)
  await page.waitForTimeout(2000);

  console.log('[Reminder] 提醒创建成功');
}

/**
 * 等待并验证收到提醒通知
 */
export async function waitForReminderNotification(
  page: Page,
  timeoutMinutes: number = 3,
): Promise<boolean> {
  console.log(`[Notification] 等待提醒通知 (最多 ${timeoutMinutes} 分钟)...`);

  const startTime = Date.now();
  const timeout = timeoutMinutes * 60 * 1000;

  while (Date.now() - startTime < timeout) {
    // 检查 SSE 事件
    const events = await getSSEEvents(page);

    const hasReminderEvent = events.some(
      (event) =>
        event.type === 'schedule:reminder-triggered' ||
        event.type === 'schedule:popup-reminder' ||
        event.type === 'schedule:sound-reminder' ||
        (event.type === 'notification' && event.data?.includes('reminder')),
    );

    if (hasReminderEvent) {
      console.log('[Notification] ✅ 收到提醒通知!');
      console.log('[Notification] 事件详情:', events);
      return true;
    }

    // 检查页面上的通知元素 (弹窗、toast 等)
    const notificationVisible =
      (await page
        .locator('[role="alert"], .notification, .toast, [class*="notification"]')
        .count()) > 0;

    if (notificationVisible) {
      console.log('[Notification] ✅ 页面显示通知!');
      return true;
    }

    // 每 5 秒检查一次
    await page.waitForTimeout(5000);

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[Notification] 已等待 ${elapsed} 秒...`);
  }

  console.log('[Notification] ❌ 超时未收到通知');
  return false;
}

/**
 * 清理测试数据 - 删除测试创建的 Reminder
 */
export async function cleanupReminder(page: Page, reminderName: string) {
  console.log(`[Cleanup] 清理测试提醒: ${reminderName}`);

  try {
    // 导航到 Reminder 列表
    await navigateToReminder(page);

    // 查找并删除
    const reminderRow = page
      .locator(`tr:has-text("${reminderName}"), [data-reminder-name="${reminderName}"]`)
      .first();

    if ((await reminderRow.count()) > 0) {
      // 点击删除按钮
      await reminderRow
        .locator('button:has-text("删除"), button[aria-label*="删除"], button.delete')
        .click();

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
 * Task Module Helpers
 * ========================================
 */

/**
 * 导航到 Task 页面
 */

/**
 * V2 shell: open a module business panel via deep link (preferred) or capsule.
 * Capsule preview + enter is a secondary path for UI contract checks.
 */
export async function openModulePanel(
  page: Page,
  module: 'goal' | 'task' | 'note' | 'reminder' | 'notification',
  route: string,
) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('business-panel').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

export async function openModuleViaCapsule(
  page: Page,
  module: 'goal' | 'task' | 'note' | 'reminder' | 'notification',
) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`capsule-nav-${module}`).click();
  await page.getByTestId('business-panel').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

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
