import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { API_CONFIG, TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

type GoalFixture = {
  id: string;
  name: string;
  keyResultId: string;
  keyResultName: string;
};

type KeyResultProjection = {
  id: string;
  title: string;
  progress: { currentValue: number; targetValue: number };
};

test.describe('Local Docker core product Phase A', () => {
  test('[P0][Fixture B] local Docker closes EachCompletion apply/replay/uncomplete/reapply without duplicate progress', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const taskName = `[PM-A] Ship product loop ${suffix}`;
    const taskDescription = 'Preserve every task plan field while switching goal bindings.';
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await registerAndLogin(page, {
      email: `pm-phase-a-${suffix}@test.com`,
      password,
      landingPath: '/goals',
    });

    const headers = {};

    const primary = await createGoalWithKeyResult(page, headers, {
      name: `[PM-A] Launch MemoFlow ${suffix}`,
      keyResultName: `[PM-A] Complete journey ${suffix}`,
    });
    const alternate = await createGoalWithKeyResult(page, headers, {
      name: `[PM-A] Reliability guard ${suffix}`,
      keyResultName: `[PM-A] Exercise binding ${suffix}`,
    });

    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('task-management-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await page.getByTestId('create-task-plan-button').click();
    await expect(page.getByTestId('task-plan-dialog')).toBeVisible();
    await page.getByTestId('task-plan-title-input').fill(taskName);
    await page.getByTestId('task-plan-description-input').fill(taskDescription);

    const toggle = page.getByTestId('task-goal-binding-toggle');
    const fixtures = [primary, alternate];
    for (let index = 0; index < 20; index += 1) {
      if ((await toggle.getAttribute('data-state')) === 'checked') {
        await toggle.click();
        await expect(toggle).toHaveAttribute('data-state', 'unchecked');
      }

      await toggle.click();
      await expect(toggle).toHaveAttribute('data-state', 'checked');
      await selectBinding(page, fixtures[index % fixtures.length]);

      await expect(page.getByTestId('task-plan-title-input')).toHaveValue(taskName);
      await expect(page.getByTestId('task-plan-description-input')).toHaveValue(
        taskDescription,
      );
      await expect(page.getByText(/Cannot read properties of null/i)).toHaveCount(0);
    }

    if ((await toggle.getAttribute('data-state')) === 'checked') {
      await toggle.click();
    }
    await toggle.click();
    await selectBinding(page, primary);
    const contributionToggle = page.getByTestId('task-goal-contribution-toggle');
    await expect(contributionToggle).toHaveAttribute('data-state', 'unchecked');
    await contributionToggle.click();
    await expect(contributionToggle).toHaveAttribute('data-state', 'checked');
    await page.getByTestId('task-goal-increment-input').fill('1');

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/v1/task-plans'),
    );
    await page.getByTestId('task-dialog-save-button').click();
    const creation = await expectApiData<{
      template: {
        id: string;
        goalBinding: {
          goalId: string;
          keyResultId: string;
          contribution: { value: number; trigger: string } | null;
        } | null;
      };
      todayInstanceCreated: boolean;
    }>(await createResponsePromise);
    expect(creation.todayInstanceCreated).toBe(true);
    expect(creation.template.goalBinding).toEqual({
      goalId: primary.id,
      keyResultId: primary.keyResultId,
      contribution: { value: 1, trigger: 'EachCompletion' },
    });

    await page.getByTestId('task-surface-plans').click();
    const taskCard = page
      .getByTestId('task-plan-card')
      .filter({ has: page.getByText(taskName, { exact: true }) })
      .first();
    await expect(taskCard).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await taskCard.getByText(taskName, { exact: true }).click();

    await page.waitForURL(new RegExp(`/tasks/${creation.template.id}$`), {
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('task-plan-overview')).toContainText('已绑定 Goal');
    await expect(page.getByTestId('task-plan-settings')).toContainText('已配置 Goal 贡献');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await showTodayOverview(page);
    const taskItem = page
      .getByTestId('daily-todo-item')
      .filter({ has: page.getByText(taskName, { exact: true }) });
    await expect(taskItem).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(taskItem).toHaveAttribute('data-task-status', 'Pending');
    const instanceId = await taskItem.getAttribute('data-task-occurrence-id');
    expect(instanceId).toBeTruthy();
    const completeButton = page.getByTestId(`complete-today-task-${instanceId}`);

    await completeButton.click();
    await expect(taskItem).toHaveAttribute('data-task-status', 'Completed');
    await expectGoalContribution(page, headers, primary, { currentValue: 1, recordCount: 1 });

    const repeatedCompletion = await page.request.post(
      `${API_CONFIG.FULL_URL}/task-occurrences/${instanceId}/complete`,
      { headers },
    );
    expect(repeatedCompletion.ok(), await repeatedCompletion.text()).toBe(true);
    await expectGoalContribution(page, headers, primary, { currentValue: 1, recordCount: 1 });

    await completeButton.click();
    await expect(taskItem).toHaveAttribute('data-task-status', 'Pending');
    await expectGoalContribution(page, headers, primary, { currentValue: 0, recordCount: 0 });

    await completeButton.click();
    await expect(taskItem).toHaveAttribute('data-task-status', 'Completed');
    await expectGoalContribution(page, headers, primary, { currentValue: 1, recordCount: 1 });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

async function createGoalWithKeyResult(
  page: Page,
  headers: Record<string, string>,
  input: { name: string; keyResultName: string },
): Promise<GoalFixture> {
  await page.goto('/goals', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('goal-list-view')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('create-goal-entry').click();
  await page.getByTestId('goal-name-input').fill(input.name);
  await page
    .getByTestId('goal-description-input')
    .fill('Created through the real local Docker product surface.');
  await page.getByTestId('add-key-result-entry').click();
  await expect(page.getByTestId('key-result-draft-form')).toBeVisible();
  await page.getByTestId('draft-kr-title-input').fill(input.keyResultName);
  await page.getByTestId('draft-kr-current-input').fill('0');
  await page.getByTestId('draft-kr-target-input').fill('10');
  await page.getByTestId('save-key-result-draft').click();
  await expect(page.getByTestId('key-result-draft-form')).toBeHidden();
  await expect(page.getByTestId('goal-dialog')).toContainText(input.keyResultName);
  await page.getByTestId('save-goal-button').click();
  await expect(page.getByTestId('goal-dialog')).toBeHidden({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });

  const card = page
    .getByTestId('goal-progress-row')
    .filter({ has: page.getByText(input.name, { exact: true }) })
    .first();
  await expect(card).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  const id = await card.getAttribute('data-goal-id');
  expect(id).toBeTruthy();

  const keyResults = await expectApiData<{ data: KeyResultProjection[]; total: number }>(
    await page.request.get(`${API_CONFIG.FULL_URL}/goals/${id}/key-results`, { headers }),
  );
  const keyResult = keyResults.data.find((item) => item.title === input.keyResultName);
  expect(keyResult).toBeDefined();

  return {
    id: id!,
    name: input.name,
    keyResultId: keyResult!.id,
    keyResultName: input.keyResultName,
  };
}

async function selectBinding(page: Page, fixture: GoalFixture): Promise<void> {
  await page.getByTestId('task-goal-select-trigger').click();
  await page.getByRole('option').filter({ hasText: fixture.name }).click();
  await expect(page.getByTestId('task-goal-select-trigger')).toContainText(fixture.name);

  const keyResultTrigger = page.getByTestId('task-key-result-select-trigger');
  await expect(keyResultTrigger).toBeEnabled();
  await keyResultTrigger.click();
  await page.getByRole('option').filter({ hasText: fixture.keyResultName }).click();
  await expect(keyResultTrigger).toContainText(fixture.keyResultName);
}

async function showTodayOverview(page: Page): Promise<void> {
  await page.getByTestId('business-panel-home').click();
  await expect(page.getByTestId('today-overview-panel')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

async function expectGoalContribution(
  page: Page,
  headers: Record<string, string>,
  fixture: GoalFixture,
  expected: { currentValue: number; recordCount: number },
): Promise<void> {
  await expect
    .poll(
      async () => {
        const keyResults = await expectApiData<{ data: KeyResultProjection[]; total: number }>(
          await page.request.get(
            `${API_CONFIG.FULL_URL}/goals/${fixture.id}/key-results`,
            { headers },
          ),
        );
        const records = await expectApiData<{ data: unknown[]; total: number }>(
          await page.request.get(
            `${API_CONFIG.FULL_URL}/goals/${fixture.id}/key-results/${fixture.keyResultId}/records`,
            { headers },
          ),
        );
        return {
          currentValue:
            keyResults.data.find((item) => item.id === fixture.keyResultId)?.progress.currentValue ??
            null,
          recordCount: records.total,
        };
      },
      { timeout: TIMEOUT_CONFIG.NAVIGATION },
    )
    .toEqual(expected);
}

async function expectApiData<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as { ok?: boolean; data?: T; error?: unknown };
  expect(response.ok(), JSON.stringify(body.error ?? body)).toBe(true);
  expect(body.ok, JSON.stringify(body)).not.toBe(false);
  expect(body.data, JSON.stringify(body)).toBeDefined();
  return body.data as T;
}
