import { expect, test, type Locator, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';
import { dragBusinessPanel } from '../helpers/business-panel';

const generateTestEmail = () =>
  `e2e-goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Goal vNext product surface', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, {
      email: generateTestEmail(),
      password: testPassword,
      landingPath: '/goals',
    });

    await expect(page.getByTestId('goal-list-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  });

  test('[P0] creates one Goal aggregate with a label and drafted key result', async ({ page }) => {
    const goalName = `E2E Goal vNext ${Date.now()}`;
    const labelName = `Launch-${Date.now()}`;

    const row = await createGoal(page, {
      name: goalName,
      summary: 'Direction plus measurable outcome.',
      labelName,
      keyResult: {
        title: 'Reach 50 active users',
        currentValue: '40',
        targetValue: '50',
        unit: 'users',
      },
    });

    await expect(row.getByTestId('goal-row-title')).toHaveText(goalName);
    await expect(row).toContainText(`#${labelName}`);
    await expect(row).toContainText(/0%/);
    await expect(row).toContainText(/0\/1/);
    await expect(page.getByTestId('goal-card')).toHaveCount(0);
  });

  test('[P0] edits a goal through the progress-row action', async ({ page }) => {
    const originalName = `E2E Goal Edit ${Date.now()}`;
    const updatedName = `Updated Goal ${Date.now()}`;
    const updatedSummary = 'Updated through the vNext Goal editor.';

    const createdRow = await createGoal(page, {
      name: originalName,
      summary: 'Original summary.',
    });
    const goalId = await goalIdFromRow(createdRow);

    await openGoalAction(page, goalId, 'edit');

    const dialog = goalDialog(page);
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await page.getByTestId('goal-name-input').fill(updatedName);
    await page.getByTestId('goal-summary-input').fill(updatedSummary);
    await goalSubmitButton(page).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    const updatedRow = goalRowById(page, goalId);
    await expect(updatedRow).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(updatedRow.getByTestId('goal-row-title')).toHaveText(updatedName);

    await openGoalAction(page, goalId, 'edit');
    await expect(page.getByTestId('goal-summary-input')).toHaveValue(updatedSummary);
  });

  test('[P0] edits an existing Goal key result through the trajectory editor', async ({ page }) => {
    const goalName = `E2E Goal Existing KR ${Date.now()}`;
    const keyResultTitle = 'Reach 50 active users';

    const createdRow = await createGoal(page, {
      name: goalName,
      summary: 'Existing Goal KR edit convergence.',
      keyResult: {
        title: keyResultTitle,
        currentValue: '40',
        targetValue: '50',
        unit: 'users',
      },
    });
    const goalId = await goalIdFromRow(createdRow);

    await openGoalAction(page, goalId, 'edit');
    const dialog = goalDialog(page);
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(dialog.getByTestId('goal-key-result-draft-row')).toContainText(keyResultTitle);

    await dialog.getByTestId('goal-key-result-draft-row').getByRole('button').first().click();
    await expect(dialog.getByTestId('kr-card-editor')).toBeVisible();
    await expect(dialog.getByTestId('kr-trajectory-editor')).toBeVisible();
    await expect(dialog.getByTestId('draft-kr-initial-input')).toHaveValue('0');
    await expect(dialog.getByTestId('draft-kr-current-input')).toHaveValue('40');
    await expect(dialog.getByTestId('draft-kr-target-input')).toHaveValue('50');

    await dialog.getByTestId('draft-kr-current-input').fill('45');
    await dialog.getByTestId('save-key-result-draft').click();
    await goalSubmitButton(page).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    await openGoalAction(page, goalId, 'edit');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await dialog.getByTestId('goal-key-result-draft-row').getByRole('button').first().click();
    await expect(dialog.getByTestId('draft-kr-current-input')).toHaveValue('45');
  });

  test('[P0] drives the explicit four-state Goal lifecycle from the inline status control', async ({
    page,
  }) => {
    const goalName = `E2E Goal Lifecycle ${Date.now()}`;
    const createdRow = await createGoal(page, {
      name: goalName,
      summary: 'Lifecycle browser contract.',
    });

    await openGoalDetail(createdRow);
    await expect(page.getByTestId('goal-detail-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'Planned');

    await chooseGoalStatus(page, /^(In progress|进行中)$/);
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'InProgress');

    await chooseGoalStatus(page, /^(Planned|规划中)$/);
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'Planned');

    await chooseGoalStatus(page, /^(In progress|进行中)$/);
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'InProgress');

    await chooseGoalStatus(page, /^(Completed|已完成)$/);
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'Completed');

    await chooseGoalStatus(page, /^(In progress|进行中)$/);
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'InProgress');

    await chooseGoalStatus(page, /^(Abandoned|已放弃)$/);
    const abandonDialog = page.getByRole('alertdialog');
    await expect(abandonDialog).toBeVisible();
    await abandonDialog.getByRole('button', { name: /^(Abandon|放弃)$/ }).click();
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'Abandoned');

    await chooseGoalStatus(page, /^(In progress|进行中)$/);
    await expect(page.getByTestId('goal-status')).toHaveAttribute('data-goal-status', 'InProgress');
  });

  test('[P0] deletes a goal through the progress-row action', async ({ page }) => {
    const goalName = `E2E Goal Delete ${Date.now()}`;
    const createdRow = await createGoal(page, {
      name: goalName,
      summary: 'This goal should be deleted.',
    });
    const goalId = await goalIdFromRow(createdRow);

    await openGoalAction(page, goalId, 'delete');

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await confirmDialog.getByRole('button', { name: /Delete|删除/i }).click();
    await expect(confirmDialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    await expect
      .poll(async () => await goalRowById(page, goalId).count(), {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
        message: `Timed out waiting for goal ${goalId} to be removed from the list.`,
      })
      .toBe(0);
  });

  test('[P0] creates a Key Result from Goal detail through the trajectory editor', async ({
    page,
  }) => {
    const goalName = `E2E Goal KR Detail ${Date.now()}`;
    const keyResultTitle = `Reduce backlog ${Date.now()}`;

    const createdRow = await createGoal(page, {
      name: goalName,
      summary: 'Standalone KR editor convergence.',
    });
    const goalId = await goalIdFromRow(createdRow);
    await openGoalDetail(createdRow);

    await page.waitForURL(new RegExp(`/goals/${goalId}$`), {
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await page.getByTestId('goal-add-key-result').click();

    const dialog = page.getByTestId('key-result-dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(dialog.getByTestId('kr-card-editor')).toBeVisible();
    await expect(dialog.getByTestId('kr-trajectory-editor')).toBeVisible();
    await expect(dialog.getByTestId('draft-kr-target-input')).toHaveValue('');

    await dialog.getByTestId('draft-kr-title-input').fill(keyResultTitle);
    await dialog.getByTestId('draft-kr-initial-input').fill('100');
    await dialog.getByTestId('draft-kr-current-input').fill('80');
    await dialog.getByTestId('draft-kr-target-input').fill('40');
    await dialog.getByTestId('draft-kr-unit-input').fill('tickets');
    await dialog.getByTestId('save-key-result-button').click();

    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    const keyResultSection = page.getByTestId('goal-workspace-key-results');
    await expect(
      keyResultSection.getByRole('textbox', { name: /^(Key Result title|关键结果标题)$/ }).first(),
    ).toHaveValue(keyResultTitle);
    const trajectory = keyResultSection.getByTestId('kr-trajectory-summary').first();
    await expect(trajectory).toContainText('100 tickets');
    await expect(trajectory).toContainText('80 tickets');
    await expect(trajectory).toContainText('40 tickets');
  });

  test('[P1] opens goal detail from the progress-row title', async ({ page }) => {
    const goalName = `E2E Goal Detail ${Date.now()}`;
    const goalSummary = 'Goal detail view should show this summary.';

    const createdRow = await createGoal(page, {
      name: goalName,
      summary: goalSummary,
    });
    const goalId = await goalIdFromRow(createdRow);

    await openGoalDetail(createdRow);

    await page.waitForURL(new RegExp(`/goals/${goalId}$`), {
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('goal-detail-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-detail-title')).toHaveValue(goalName);
    await expect(page.getByTestId('goal-detail-summary')).toHaveValue(goalSummary);
  });

  test('[P0] edits Goal identity directly on the detail workspace without a global edit mode', async ({
    page,
  }) => {
    const goalName = `E2E Inline Goal ${Date.now()}`;
    const updatedName = `E2E Inline Updated ${Date.now()}`;
    const createdRow = await createGoal(page, {
      name: goalName,
      summary: 'Inline editing contract.',
    });

    await openGoalDetail(createdRow);
    await expect(page.getByTestId('goal-detail-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(
      page.getByTestId('goal-detail-toolbar').getByRole('button', { name: /^(Edit|编辑)$/ }),
    ).toHaveCount(0);

    const title = page.getByTestId('goal-detail-title');
    await title.fill(updatedName);
    await title.press('Enter');

    await page.reload();
    await expect(page.getByTestId('goal-detail-title')).toHaveValue(updatedName);
  });

  test('[P0] exposes only vNext system views and preserves Label filter state while resizing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const labelName = `Filter-${Date.now()}`;
    const goalName = `E2E Goal Filter ${Date.now()}`;

    await createGoal(page, { name: goalName, summary: 'Label-filter fixture.', labelName });

    const toolbar = page.getByTestId('goal-page-toolbar');
    const primaryCreate = page.locator('[data-primary-action="create-goal"]:visible');
    const labelFilter = page.getByTestId('label-filter-trigger');
    await expect(toolbar).toBeVisible();
    await expect(primaryCreate).toHaveCount(1);
    await expect(page.getByTestId('goal-search-input')).toHaveCount(0);
    await expect(page.getByTestId('goal-refresh-entry')).toHaveCount(0);
    await expectToolbarToFit(toolbar);

    await openSystemViewMenu(page);
    await expect(page.getByRole('menuitem', { name: /^(Active|进行中)$/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(Completed|已完成)$/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(All|全部)$/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await labelFilter.click();
    const filterSearch = page.getByPlaceholder(/Search labels|搜索标签/i).last();
    await filterSearch.fill(labelName);
    const labelOption = page.getByRole('option', { name: labelName, exact: true });
    await expect(labelOption).toBeVisible();
    await labelOption.click({ force: true });
    await page.keyboard.press('Escape');
    await expect(labelFilter).toContainText('1');
    await expect(waitForGoalRowByName(page, goalName)).resolves.toBeDefined();

    await toolbar.evaluate((element) => element.setAttribute('data-instance-probe', 'stable'));
    const scrollViewport = page
      .getByTestId('goal-list-scroll')
      .locator('[data-reka-scroll-area-viewport]');
    await expect(scrollViewport).toBeVisible();
    await scrollViewport.evaluate((element) => {
      const filler = document.createElement('div');
      filler.style.height = '1200px';
      filler.dataset.layoutProbe = 'filler';
      element.appendChild(filler);
      element.scrollTop = 96;
    });

    await dragBusinessPanel(page, 'wider');
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(labelFilter).toContainText('1');
    expect(await scrollViewport.evaluate((element) => element.scrollTop)).toBe(96);
    await expectToolbarToFit(toolbar);

    await dragBusinessPanel(page, 'narrower');
    await expect(primaryCreate).toHaveCount(1);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');
    await expect(labelFilter).toContainText('1');
    expect(await scrollViewport.evaluate((element) => element.scrollTop)).toBe(96);
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

async function createGoal(
  page: Page,
  data: {
    name: string;
    summary: string;
    labelName?: string;
    keyResult?: {
      title: string;
      currentValue: string;
      targetValue: string;
      unit: string;
    };
  },
): Promise<Locator> {
  await openCreateGoalDialog(page);

  const dialog = goalDialog(page);
  await page.getByTestId('goal-name-input').fill(data.name);
  await page.getByTestId('goal-summary-input').fill(data.summary);

  if (data.labelName) {
    await page.getByTestId('label-picker-trigger').click();
    const labelSearch = page.getByPlaceholder(/Search labels|搜索标签/i).last();
    await labelSearch.fill(data.labelName);
    await page.getByTestId('label-create-option').click();
    await expect(page.getByTestId('label-picker-trigger')).toContainText(data.labelName);
    await page.keyboard.press('Escape');
  }

  if (data.keyResult) {
    await page.getByTestId('add-key-result-entry').click();
    await page.getByTestId('draft-kr-title-input').fill(data.keyResult.title);
    await page.getByTestId('draft-kr-current-input').fill(data.keyResult.currentValue);
    await page.getByTestId('draft-kr-target-input').fill(data.keyResult.targetValue);
    await page.getByTestId('draft-kr-unit-input').fill(data.keyResult.unit);
    await page.getByTestId('save-key-result-draft').click();
    await expect(page.getByTestId('goal-key-result-draft-row')).toContainText(data.keyResult.title);
  }

  await goalSubmitButton(page).click();
  await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

  return waitForGoalRowByName(page, data.name);
}

async function openCreateGoalDialog(page: Page): Promise<void> {
  const stableCreateEntry = page.getByTestId('create-goal-entry');
  if (await stableCreateEntry.isVisible().catch(() => false)) {
    await stableCreateEntry.click();
  } else {
    await page.goto(WEB_CONFIG.getFullUrl('/goals?dialog=goal'), {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  }

  await expect(goalDialog(page)).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
}

async function openSystemViewMenu(page: Page): Promise<void> {
  await page
    .getByTestId('goal-page-toolbar')
    .getByRole('button')
    .filter({ hasText: /Active|进行中/ })
    .first()
    .click();
}

async function chooseGoalStatus(page: Page, name: RegExp): Promise<void> {
  await page.getByTestId('goal-status-picker').click();
  await page.getByRole('menuitemradio', { name }).click();
}

function goalDialog(page: Page): Locator {
  return page.getByTestId('goal-dialog');
}

function goalSubmitButton(page: Page): Locator {
  return page.getByTestId('save-goal-button');
}

async function waitForGoalRowByName(page: Page, goalName: string): Promise<Locator> {
  const row = page
    .getByTestId('goal-progress-row')
    .filter({ has: page.getByText(goalName, { exact: true }) })
    .first();
  await expect(row).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  return row;
}

function goalRowById(page: Page, goalId: string): Locator {
  return page.locator(`[data-testid="goal-progress-row"][data-goal-id="${goalId}"]`);
}

async function goalIdFromRow(goalRow: Locator): Promise<string> {
  const goalId = await goalRow.getAttribute('data-goal-id');
  expect(goalId).toBeTruthy();
  return goalId!;
}

async function openGoalDetail(goalRow: Locator): Promise<void> {
  await expect(goalRow).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await goalRow.getByRole('button').first().click();
}

async function openGoalAction(
  page: Page,
  goalId: string,
  action: 'edit' | 'delete',
): Promise<void> {
  const row = goalRowById(page, goalId);
  await expect(row).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await row.hover();
  await row.locator('..').getByTestId('goal-row-more-actions').click();
  await page
    .getByRole('menuitem', { name: action === 'edit' ? /^(编辑|Edit)$/ : /^(删除|Delete)$/ })
    .click();
}
