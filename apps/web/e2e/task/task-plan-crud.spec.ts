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

  test('should create a new task plan', async ({ page }) => {
    const planTitle = `E2E Task Plan ${Date.now()}`;

    const creation = await createTaskPlan(page, planTitle);

    await expect(taskCardByTitle(page, planTitle)).toBeVisible();
    await expect(taskCardByTitle(page, planTitle)).toContainText(/已启用|Enabled/i);
    expect(creation.occurrenceCount).toBeGreaterThanOrEqual(0);
    expect(typeof creation.todayOccurrenceCreated).toBe('boolean');
    await expect(
      page.getByText(
        creation.todayOccurrenceCreated
          ? /任务计划已创建，并生成今日待办任务|Task plan created and today's to-do generated/i
          : /任务计划已创建，今天不会生成待办任务|Task plan created with no to-do due today/i,
      ),
    ).toBeVisible();
  });

  test('[P0] persists create-dialog checklist into today occurrence and checklist mutation', async ({
    page,
  }) => {
    const planTitle = `E2E Checklist Task ${Date.now()}`;
    const checklistTitles = ['Prepare evidence', 'Publish result'];

    await openCreateTaskDialog(page);
    const dialog = page.getByTestId('task-plan-dialog');
    await taskTitleInput(page).fill(planTitle);
    await taskDescriptionInput(page).fill('Verifies checklist create and occurrence persistence.');

    const dialogBodyBox = await dialog.getByTestId('product-dialog-body').boundingBox();
    const checklistBox = await dialog.getByTestId('task-checklist-editor').boundingBox();
    if (!dialogBodyBox || !checklistBox) {
      throw new Error('Expected Task workspace body and checklist geometry to be measurable');
    }
    const checklistBottomGap =
      dialogBodyBox.y + dialogBodyBox.height - (checklistBox.y + checklistBox.height);
    expect(checklistBottomGap).toBeLessThanOrEqual(24);

    for (const title of checklistTitles) {
      await dialog.getByTestId('task-checklist-add').click();
      await dialog.getByTestId('task-checklist-new-item').fill(title);
      await dialog.getByTestId('task-checklist-save').click();
    }

    const definitionList = dialog.getByTestId('task-checklist-definition-list');
    await expect(definitionList).toContainText(checklistTitles[0]!);
    await expect(definitionList).toContainText(checklistTitles[1]!);

    const createRequestPromise = page.waitForRequest(
      (request) =>
        /\/task-plans\/?(\?|$)/.test(new URL(request.url()).pathname) &&
        request.method() === 'POST',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    const createResponsePromise = page.waitForResponse(
      (response) =>
        /\/task-plans\/?(\?|$)/.test(new URL(response.url()).pathname) &&
        response.request().method() === 'POST',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );

    await expect(taskPrimaryActionButton(page)).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await taskPrimaryActionButton(page).click();

    const createRequest = await createRequestPromise;
    const requestPayload = createRequest.postDataJSON() as {
      checklist?: Array<{ id: string; title: string; order: number }>;
    };
    expect(requestPayload.checklist?.map(({ title, order }) => ({ title, order }))).toEqual([
      { title: checklistTitles[0], order: 0 },
      { title: checklistTitles[1], order: 1 },
    ]);
    expect(requestPayload.checklist?.every((item) => item.id.length > 0)).toBe(true);

    const createResponse = await createResponsePromise;
    expect(
      createResponse.ok(),
      `Expected checklist task creation to succeed, got ${createResponse.status()}`,
    ).toBe(true);
    const responseBody = (await createResponse.json()) as {
      data?: {
        plan: {
          id: string;
          checklist: Array<{ id: string; title: string; order: number }>;
        };
        todayOccurrenceCreated: boolean;
      };
      plan?: {
        id: string;
        checklist: Array<{ id: string; title: string; order: number }>;
      };
      todayOccurrenceCreated?: boolean;
    };
    const creation = responseBody.data ?? responseBody;
    expect(creation.plan?.checklist.map(({ title, order }) => ({ title, order }))).toEqual([
      { title: checklistTitles[0], order: 0 },
      { title: checklistTitles[1], order: 1 },
    ]);
    expect(creation.todayOccurrenceCreated).toBe(true);

    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await selectTaskSurface(page, 'today');

    const occurrence = taskOccurrenceByTitle(page, planTitle);
    await expect(occurrence).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(occurrence.getByTestId('task-occurrence-checklist')).toBeVisible();
    const firstChecklistItem = occurrence.getByRole('checkbox', {
      name: checklistTitles[0],
    });
    const secondChecklistItem = occurrence.getByRole('checkbox', {
      name: checklistTitles[1],
    });
    await expect(firstChecklistItem).toHaveAttribute('data-state', 'unchecked');
    await expect(secondChecklistItem).toHaveAttribute('data-state', 'unchecked');

    const checklistWritePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/task-occurrences\/[^/]+\/checklist$/.test(new URL(response.url()).pathname),
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    await firstChecklistItem.click();
    const checklistWrite = await checklistWritePromise;
    expect(
      checklistWrite.ok(),
      `Expected checklist mutation to succeed, got ${checklistWrite.status()}`,
    ).toBe(true);
    await expect(firstChecklistItem).toHaveAttribute('data-state', 'checked');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectTaskSurface(page, 'today');
    const persistedOccurrence = taskOccurrenceByTitle(page, planTitle);
    await expect(
      persistedOccurrence.getByRole('checkbox', { name: checklistTitles[0] }),
    ).toHaveAttribute('data-state', 'checked');
    await expect(
      persistedOccurrence.getByRole('checkbox', { name: checklistTitles[1] }),
    ).toHaveAttribute('data-state', 'unchecked');
  });

  test('should display task plan list', async ({ page }) => {
    await expect(page.getByTestId('task-management-view')).toBeVisible();
    await expect(page.getByTestId('task-surface-trigger')).toBeVisible();
    await page.getByTestId('task-surface-trigger').click();
    await expect(page.getByTestId('task-surface-today')).toBeVisible();
    await expect(page.getByTestId('task-surface-upcoming')).toHaveCount(0);
    await expect(page.getByTestId('task-surface-plans')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-task-plan-button')).toBeVisible();
  });

  test('should edit an existing task plan inline from the detail workspace', async ({ page }) => {
    const originalTitle = `E2E Edit Task ${Date.now()}`;
    const updatedTitle = `${originalTitle} Updated`;
    const updatedDescription = 'Inline detail workspace description';

    await createTaskPlan(page, originalTitle);

    const row = taskCardByTitle(page, originalTitle);
    await row.getByRole('button').first().click();

    await expect(page.getByTestId('task-plan-workspace')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('task-plan-dialog')).toHaveCount(0);
    await expect(page.getByTestId('task-detail-more-actions')).toBeVisible();
    await expect(page.getByTestId('task-detail-metadata')).toBeVisible();
    await expect(page.getByTestId('task-properties-row')).toBeVisible();
    await expect(page.getByTestId('task-properties-more')).toBeVisible();
    await expect(page.getByTestId('task-goal-row')).toHaveCount(0);
    await expect(page.getByTestId('task-labels-row')).toHaveCount(0);
    await expect(page.getByTestId('task-reminders-row')).toHaveCount(0);

    await page.getByTestId('task-properties-more').click();
    await expect(page.getByRole('menuitem', { name: /^(关联 Goal|Linked Goal)$/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(标签|Labels)$/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(提醒|Reminders)$/ })).toBeVisible();

    await page.getByRole('menuitem', { name: /^(标签|Labels)$/ }).click();
    await expect(
      page.getByRole('menuitem', { name: /^(创建或管理标签…|Create or manage labels…)$/ }),
    ).toBeVisible();
    await page
      .getByRole('menuitem', { name: /^(创建或管理标签…|Create or manage labels…)$/ })
      .click();
    await expect(page.getByTestId('task-labels-row')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-labels-row')).toHaveCount(0);

    await page.getByTestId('task-properties-more').click();
    await page.getByRole('menuitem', { name: /^(关联 Goal|Linked Goal)$/ }).click();
    await expect(
      page.getByRole('menuitem', { name: /^(更多关联设置…|More binding settings…)$/ }),
    ).toBeVisible();
    await page.getByRole('menuitem', { name: /^(更多关联设置…|More binding settings…)$/ }).click();
    await expect(page.getByTestId('task-goal-row')).toBeVisible();
    await expect(page.getByTestId('task-goal-binding-toggle')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-goal-row')).toHaveCount(0);

    await page.getByTestId('task-properties-more').click();
    await page.getByRole('menuitem', { name: /^(提醒|Reminders)$/ }).click();
    await expect(
      page.getByRole('menuitem', { name: /^(提前 15 分钟|15 minutes before)$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: /^(自定义时间…|Custom time…)$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: /^(更多提醒设置…|More reminder settings…)$/ }),
    ).toBeVisible();
    await page.getByRole('menuitem', { name: /^(更多提醒设置…|More reminder settings…)$/ }).click();
    await expect(page.getByTestId('task-reminders-row')).toBeVisible();
    await expect(page.getByTestId('task-reminder-enabled')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-reminders-row')).toHaveCount(0);

    const titleInput = page.getByTestId('task-detail-title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(updatedTitle);

    const titlePatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/task-plans/') && response.request().method() === 'PATCH',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    const titleWorkspaceRefreshPromise = page.waitForResponse(
      (response) =>
        /\/tasks\/[^/]+\/workspace$/.test(new URL(response.url()).pathname) &&
        response.request().method() === 'GET',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    await titleInput.blur();
    const titlePatch = await titlePatchPromise;
    expect(
      titlePatch.ok(),
      `Expected inline title update to succeed, got ${titlePatch.status()}`,
    ).toBeTruthy();
    await titleWorkspaceRefreshPromise;

    const descriptionInput = page.getByTestId('task-detail-description');
    await descriptionInput.fill(updatedDescription);
    const descriptionPatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/task-plans/') && response.request().method() === 'PATCH',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    await descriptionInput.blur();
    const descriptionPatch = await descriptionPatchPromise;
    expect(
      descriptionPatch.ok(),
      `Expected inline description update to succeed, got ${descriptionPatch.status()}`,
    ).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('task-plan-workspace')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('task-detail-title')).toHaveValue(updatedTitle);
    await expect(page.getByTestId('task-detail-description')).toHaveValue(updatedDescription);

    await page.getByRole('button', { name: /^(返回|Back)$/ }).click();
    await selectTaskSurface(page, 'plans');
    await expect(taskCardByTitle(page, updatedTitle)).toBeVisible();
    await expect(taskCardByTitle(page, originalTitle)).toHaveCount(0);
  });

  test('should delete a task plan', async ({ page }) => {
    const planTitle = `E2E Delete Task ${Date.now()}`;

    await createTaskPlan(page, planTitle);

    const card = taskCardByTitle(page, planTitle);
    await card.hover();
    await card.locator('..').getByTestId('task-plan-row-more-actions').click();
    await page.getByRole('menuitem', { name: /^(删除|Delete)$/ }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await page.getByTestId('global-confirm-confirm').click();

    await expect(taskCardByTitle(page, planTitle)).toHaveCount(0);
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
    const statusFilter = page.getByTestId('task-status-filter');
    const compactViewOptions = page.getByTestId('task-compact-view-options');
    const primaryCreate = page.locator('[data-primary-action="create-task"]:visible');
    const scrollHost = page.getByTestId('task-management-scroll-host');

    await expect(toolbar).toBeVisible();
    await expect(primaryCreate).toHaveCount(1);
    await expectToolbarToFit(toolbar);
    await statusFilter.click();
    await page.getByTestId('task-status-filter-pending').click();
    await statusFilter.focus();
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
    await expect(statusFilter).toBeVisible();
    await expect(statusFilter).toContainText(/Pending|待处理/);
    await expect(statusFilter).toBeFocused();
    expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(96);
    await expectToolbarToFit(toolbar);

    for (let index = 0; index < 3; index += 1) {
      await dragBusinessPanel(page, 'narrower');
    }
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(statusFilter).toBeHidden();
    await expect(compactViewOptions).toBeVisible();
    await expect(compactViewOptions).toContainText('1');
    await expect(page.getByTestId('task-goal-filter')).toHaveCount(0);
    expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(96);
    await expectToolbarToFit(toolbar);

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(statusFilter).toBeVisible();
    await expect(statusFilter).toContainText(/Pending|待处理/);
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
      !response.url().includes('/generate-occurrences') &&
      !response.url().includes('/bind-goal') &&
      !response.url().includes('/unbind-goal'),
    { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
  );
  await saveButton.click();
  const createResponse = await createResponsePromise;
  if (!createResponse.ok()) {
    const body = await createResponse.text();
    throw new Error(`Task plan create failed: ${createResponse.status()} ${body.slice(0, 500)}`);
  }
  const responseBody = (await createResponse.json()) as {
    data?: { plan: { id: string }; occurrenceCount: number; todayOccurrenceCreated: boolean };
    plan: { id: string };
    occurrenceCount: number;
    todayOccurrenceCreated: boolean;
  };
  const creation = responseBody.data ?? responseBody;

  await expect(page.getByTestId('task-plan-dialog')).toBeHidden({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await selectTaskSurface(page, 'plans');
  await expect(taskCardByTitle(page, title)).toBeVisible();
  return {
    plan: creation.plan,
    occurrenceCount: creation.occurrenceCount,
    todayOccurrenceCreated: creation.todayOccurrenceCreated,
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
    .getByTestId('task-plan-row')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
}

function taskOccurrenceByTitle(page: Page, title: string): Locator {
  return page
    .getByTestId('task-occurrence-row')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
}

async function selectTaskSurface(
  page: Page,
  surface: 'today' | 'upcoming' | 'plans',
): Promise<void> {
  await page.getByTestId('task-surface-trigger').click();
  await page.getByTestId(`task-surface-${surface}`).click();
}
