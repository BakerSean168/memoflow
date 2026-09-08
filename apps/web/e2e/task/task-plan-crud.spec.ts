import { test, expect, type Locator, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';
import { dragBusinessPanel } from '../helpers/business-panel';

const generateTestEmail = () =>
  `e2e-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Task Plan CRUD Operations', () => {
  let testEmail: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail();

    await registerAndLogin(page, {
      email: testEmail,
      password: testPassword,
      landingPath: '/tasks',
    });

    await expect(page.getByTestId('task-management-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  });

  test('should create a new task template', async ({ page }) => {
    const templateTitle = `E2E Task Template ${Date.now()}`;

    const creation = await createTaskPlan(page, templateTitle);

    await expect(taskCardByTitle(page, templateTitle)).toBeVisible();
    await expect(taskCardByTitle(page, templateTitle)).toContainText(/已启用中|Active/i);
    expect(creation.instanceCount).toBeGreaterThanOrEqual(0);
    expect(typeof creation.todayInstanceCreated).toBe('boolean');
    await expect(
      page.getByText(
        creation.todayInstanceCreated
          ? /任务计划已创建，并生成今日待办任务|Task plan created and today's to-do generated/i
          : /任务计划已创建，今天不会生成待办任务|Task plan created with no to-do due today/i,
      ),
    ).toBeVisible();
  });

  test('should display task template list', async ({ page }) => {
    await expect(page.getByTestId('task-management-view')).toBeVisible();
    await expect(page.getByTestId('task-surface-today')).toBeVisible();
    await expect(page.getByTestId('task-surface-upcoming')).toBeVisible();
    await expect(page.getByTestId('task-surface-plans')).toBeVisible();
    await expect(page.getByTestId('create-task-plan-button')).toBeVisible();
  });

  test('should edit an existing task template', async ({ page }) => {
    const originalTitle = `E2E Edit Task ${Date.now()}`;
    const updatedTitle = `${originalTitle} Updated`;

    await createTaskPlan(page, originalTitle);

    const card = taskCardByTitle(page, originalTitle);
    await card.getByRole('button', { name: /^(编辑|Edit)$/ }).click();

    await expect(taskTitleInput(page)).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    const saveButton = taskPrimaryActionButton(page);

    await taskTitleInput(page).fill(updatedTitle);
    await expect(saveButton).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/task-plans/') && response.request().method() === 'PATCH',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    await saveButton.click();
    const patchResponse = await patchResponsePromise;
    expect(
      patchResponse.ok(),
      `Expected task template update to succeed, got ${patchResponse.status()}`,
    ).toBeTruthy();

    await expect(page.getByTestId('task-plan-dialog')).toBeHidden({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(taskCardByTitle(page, updatedTitle)).toBeVisible();
    await expect(taskCardByTitle(page, originalTitle)).toHaveCount(0);
  });

  test('should delete a task template', async ({ page }) => {
    const templateTitle = `E2E Delete Task ${Date.now()}`;

    await createTaskPlan(page, templateTitle);

    const card = taskCardByTitle(page, templateTitle);
    await card.getByRole('button', { name: /^(删除|Delete)$/ }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await page.getByTestId('global-confirm-confirm').click();

    await expect(taskCardByTitle(page, templateTitle)).toHaveCount(0);
  });

  test('should require a title before allowing save', async ({ page }) => {
    await openCreateTaskDialog(page);

    await expect(taskPrimaryActionButton(page)).toBeDisabled();
  });

  test('[P0] keeps one task toolbar DOM and filter state across panel layouts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const toolbar = page.getByTestId('task-page-toolbar');
    const searchInput = page.getByTestId('task-search-input');
    const primaryCreate = page.locator('[data-primary-action="create-task"]:visible');
    const scrollHost = page.getByTestId('task-management-scroll-host');

    await expect(toolbar).toBeVisible();
    await expect(primaryCreate).toHaveCount(1);
    await expectToolbarToFit(toolbar);
    await searchInput.fill('stable-task-filter');
    await searchInput.focus();
    await toolbar.evaluate((element) => element.setAttribute('data-instance-probe', 'stable'));
    await expect(page.getByTestId('task-loading-state')).toHaveCount(0);
    await scrollHost.evaluate((element) => {
      // Keep the probe outside Vue's managed child list so a legitimate data refresh
      // cannot delete the test-only overflow while the panel is being resized.
      element.style.paddingBottom = '1200px';
      element.scrollTop = 96;
    });

    await dragBusinessPanel(page, 'wider');
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(searchInput).toHaveValue('stable-task-filter');
    await expect(searchInput).toBeFocused();
    expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(96);
    await expectToolbarToFit(toolbar);

    await dragBusinessPanel(page, 'narrower');
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(searchInput).toHaveValue('stable-task-filter');
    expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(96);
    await expectToolbarToFit(toolbar);

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(searchInput).toHaveValue('stable-task-filter');
    expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(96);
    await expectToolbarToFit(toolbar);
  });
});

async function expectToolbarToFit(toolbar: Locator): Promise<void> {
  const metrics = await toolbar.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function openCreateTaskDialog(page: Page) {
  const primaryCreateButton = page.getByTestId('create-task-plan-button');
  await primaryCreateButton.click();

  await expect(page.getByTestId('task-plan-dialog')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await expect(taskTitleInput(page)).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

async function createTaskPlan(page: Page, title: string) {
  await openCreateTaskDialog(page);
  const saveButton = taskPrimaryActionButton(page);

  await taskTitleInput(page).fill(title);
  await taskDescriptionInput(page).fill(`Description for ${title}`);
  await expect(saveButton).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

  const createResponsePromise = page.waitForResponse(
    (response) =>
      /\/task-plans\/?(\?|$)/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      !response.url().includes('/activate') &&
      !response.url().includes('/pause') &&
      !response.url().includes('/archive') &&
      !response.url().includes('/generate-instances') &&
      !response.url().includes('/bind-goal') &&
      !response.url().includes('/unbind-goal'),
    { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
  );
  await saveButton.click();
  const createResponse = await createResponsePromise;
  if (!createResponse.ok()) {
    const body = await createResponse.text();
    throw new Error(
      `Task template create failed: ${createResponse.status()} ${body.slice(0, 500)}`,
    );
  }
  const responseBody = (await createResponse.json()) as {
    data?: { instanceCount?: number; todayInstanceCreated?: boolean };
    instanceCount?: number;
    todayInstanceCreated?: boolean;
  };
  const creation = responseBody.data ?? responseBody;

  await expect(page.getByTestId('task-plan-dialog')).toBeHidden({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await page.getByTestId('task-surface-plans').click();
  await expect(taskCardByTitle(page, title)).toBeVisible();
  return {
    instanceCount: creation.instanceCount ?? 0,
    todayInstanceCreated: creation.todayInstanceCreated ?? false,
  };
}

function taskTitleInput(page: Page): Locator {
  return page.getByTestId('task-plan-title-input');
}

function taskDescriptionInput(page: Page): Locator {
  return page.getByTestId('task-plan-description-input');
}

function taskPrimaryActionButton(page: Page): Locator {
  return page.getByTestId('task-dialog-save-button');
}

function taskCardByTitle(page: Page, title: string): Locator {
  return page
    .locator('[data-testid="task-plan-card"]')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
}
