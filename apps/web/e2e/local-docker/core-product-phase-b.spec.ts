import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { API_CONFIG, TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

type TaskPlanCreation = {
  template: { id: string };
  instanceCount: number;
  todayInstanceCreated: boolean;
};

type TaskOccurrenceProjection = {
  id: string;
  instanceDate: number;
  status: 'Pending' | 'InProgress' | 'Completed' | 'Skipped' | 'Expired';
  importance: 'Vital' | 'Important' | 'Moderate' | 'Minor' | 'Trivial';
};

test.describe('Local Docker core product Phase B', () => {
  test('[P1] keeps task drafts, product semantics, projections, and update propagation consistent', async ({
    page,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const planName = `[PM-B] Weekly product review ${suffix}`;
    const recurringPlanName = `[PM-B] Recurring delivery ${suffix}`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await registerAndLogin(page, {
      email: `pm-phase-b-${suffix}@test.com`,
      password,
      landingPath: '/tasks',
    });
    await page.evaluate(() => {
      localStorage.setItem(
        'presentation-preference',
        JSON.stringify({ locale: 'zh-CN', theme: 'auto' }),
      );
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByTestId('task-management-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    const headers = {};

    await expect(page.getByTestId('create-task-plan-button')).toHaveText('新建计划');
    await expectElementToFit(page.getByTestId('task-page-toolbar'));

    await page.getByTestId('create-task-plan-button').click();
    await page.getByTestId('task-plan-title-input').fill('不应保留的草稿');
    await page.getByTestId('task-plan-description-input').fill('取消后必须丢弃');
    await page
      .getByTestId('task-plan-dialog')
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await page.getByTestId('create-task-plan-button').click();
    await expect(page.getByTestId('task-plan-title-input')).toHaveValue('');
    await expect(page.getByTestId('task-plan-description-input')).toHaveValue('');

    const planCreationPromise = waitForTemplateWrite(page, 'POST');
    await page.getByTestId('task-plan-title-input').fill(planName);
    await page.getByTestId('task-plan-description-input').fill('完整任务计划');
    await page.getByTestId('task-dialog-save-button').click();
    await expectApiData<TaskPlanCreation>(await planCreationPromise);
    await expect(page.getByText(/任务计划已创建/).first()).toBeVisible();
    await showPlansSurface(page);
    await expect(taskCard(page, planName)).toBeVisible();

    await page.getByTestId('create-task-plan-button').click();
    await expect(page.getByTestId('task-plan-title-input')).toHaveValue('');
    await page
      .getByTestId('task-plan-dialog')
      .getByRole('button', { name: '取消', exact: true })
      .click();

    const recurringStartDate = await page.evaluate(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });

    const recurringCreation = await expectApiData<TaskPlanCreation>(
      await page.request.post(`${API_CONFIG.FULL_URL}/task-plans`, {
        headers,
        data: {
          name: recurringPlanName,
          description: 'Verifies future Pending propagation.',
          schedule: {
            kind: 'Recurring',
            startDate: recurringStartDate,
            timing: { kind: 'AllDay' },
            recurrence: {
              frequency: 'Daily',
              interval: 1,
              byWeekday: [],
              end: { kind: 'Count', count: 5 },
            },
          },
          reminderConfig: null,
          importance: 'Moderate',
          labelIds: [],
          goalBinding: null,
        },
      }),
    );
    const initialInstances = await listInstances(
      page,
      headers,
      recurringCreation.template.id,
    );
    const editBoundary = Date.now();
    const todayPending = initialInstances.find(
      (instance) => instance.status === 'Pending' && instance.instanceDate <= editBoundary,
    );
    const futurePending = initialInstances.find(
      (instance) => instance.status === 'Pending' && instance.instanceDate > editBoundary,
    );
    const futureToStart = initialInstances.find(
      (instance) =>
        instance.status === 'Pending' &&
        instance.instanceDate > editBoundary &&
        instance.id !== futurePending?.id,
    );
    expect(todayPending).toBeDefined();
    expect(futurePending).toBeDefined();
    expect(futureToStart).toBeDefined();
    await expectApiData<TaskOccurrenceProjection>(
      await page.request.post(`${API_CONFIG.FULL_URL}/task-occurrences/${futureToStart!.id}/start`, {
        headers,
      }),
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await showPlansSurface(page);
    await taskCard(page, recurringPlanName).getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByTestId('task-plan-update-impact')).toContainText(
      /将更新 \d+ 个尚未开始的待办任务/,
    );
    await page.getByTestId('task-form-advanced-toggle').click();
    await expect(page.getByTestId('task-form-advanced-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.locator('#importance-select').click();
    await page.getByRole('option', { name: '高', exact: true }).click();
    const updatePromise = waitForTemplateWrite(page, 'PATCH');
    await page.getByTestId('task-dialog-save-button').click();
    await expectApiData<unknown>(await updatePromise);

    await expect
      .poll(
        async () => {
          const instances = await listInstances(page, headers, recurringCreation.template.id);
          const byId = new Map(instances.map((instance) => [instance.id, instance]));
          return {
            today: byId.get(todayPending!.id)?.importance,
            futurePending: byId.get(futurePending!.id)?.importance,
            futureStarted: byId.get(futureToStart!.id)?.importance,
            futureStartedStatus: byId.get(futureToStart!.id)?.status,
          };
        },
        { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
      )
      .toEqual({
        today: 'Moderate',
        futurePending: 'Important',
        futureStarted: 'Moderate',
        futureStartedStatus: 'InProgress',
      });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await showTodayOverview(page);
    const recurringTodo = todayTodo(page, recurringPlanName);
    await expect(recurringTodo).toHaveAttribute('data-task-status', 'Pending');
    await recurringTodo.locator('button[title]').click();
    await expect(recurringTodo).toHaveAttribute('data-task-status', 'Completed');
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await showPlansSurface(page);
    await expect(taskCard(page, recurringPlanName)).toBeVisible();
    await testInfo.attach('phase-b-task-projections-1280x720', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await showTodayOverview(page);
    await todayTodo(page, recurringPlanName).locator('button[title]').click();
    await expect(todayTodo(page, recurringPlanName)).toHaveAttribute('data-task-status', 'Pending');
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await showPlansSurface(page);
    await expect(taskCard(page, recurringPlanName)).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

function taskCard(page: Page, title: string): Locator {
  return page
    .getByTestId('task-plan-card')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
}

function todayTodo(page: Page, title: string): Locator {
  return page
    .getByTestId('daily-todo-item')
    .filter({ has: page.getByText(title, { exact: true }) });
}

async function showTodayOverview(page: Page): Promise<void> {
  await page.getByTestId('business-panel-home').click();
  await expect(page.getByTestId('today-overview-panel')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

async function showPlansSurface(page: Page): Promise<void> {
  await page.getByTestId('task-surface-plans').click();
  await expect(page.getByTestId('task-plan-list')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}
function waitForTemplateWrite(page: Page, method: 'POST' | 'PATCH') {
  return page.waitForResponse(
    (response) => {
      if (response.request().method() !== method) {
        return false;
      }
      const path = new URL(response.url()).pathname;
      return method === 'POST'
        ? path.endsWith('/api/v1/task-plans')
        : /\/api\/v1\/task-plans\/[^/]+$/.test(path);
    },
    { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
  );
}

async function listInstances(
  page: Page,
  headers: Record<string, string>,
  templateId: string,
): Promise<TaskOccurrenceProjection[]> {
  return expectApiData<TaskOccurrenceProjection[]>(
    await page.request.get(`${API_CONFIG.FULL_URL}/task-occurrences?templateId=${templateId}`, {
      headers,
    }),
  );
}

async function expectElementToFit(locator: Locator): Promise<void> {
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
}

async function expectApiData<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as { ok?: boolean; data?: T; error?: unknown };
  expect(response.ok(), JSON.stringify(body.error ?? body)).toBe(true);
  expect(body.ok, JSON.stringify(body)).not.toBe(false);
  expect(body.data, JSON.stringify(body)).toBeDefined();
  return body.data as T;
}
