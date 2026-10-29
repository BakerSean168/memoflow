import { expect, type Locator, type Page } from '@playwright/test';

export type GoalSurface = 'web' | 'desktop';

function goalCard(page: Page, goalName: string): Locator {
  // The list renders one row per goal (goal-card was retired with the list
  // redesign); the title lives inside the row.
  return page.getByTestId('goal-progress-row').filter({ hasText: goalName }).first();
}

async function openContextMenuAction(
  page: Page,
  goalName: string,
  actionName: RegExp,
): Promise<void> {
  const card = goalCard(page, goalName);
  await expect(card).toBeVisible();
  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: actionName }).click();
}

async function confirmDelete(page: Page): Promise<void> {
  const destructiveButton = page.getByRole('button', { name: /删除|Delete/i });
  if ((await destructiveButton.count()) > 0) {
    await destructiveButton.last().click();
    return;
  }

  const confirmButton = page.getByRole('button', { name: /确认|Confirm/i });
  await confirmButton.last().click();
}

export async function openGoalList(page: Page, surface: GoalSurface): Promise<void> {
  // Web and desktop use the same goal UI but different routing styles.
  // Keep that divergence in one helper so sync specs stay workflow-focused.
  if (surface === 'web') {
    await page.goto('/goals', { waitUntil: 'domcontentloaded' });
  } else {
    const currentUrl = page.url();
    const baseUrl = currentUrl.split('#')[0];
    await page.goto(`${baseUrl}#/goals`, { waitUntil: 'domcontentloaded' });
  }

  await expect(page.getByTestId('goal-list-view')).toBeVisible();
  await expect(page.getByTestId('create-goal-entry')).toBeVisible();
}

export async function createGoal(
  page: Page,
  surface: GoalSurface,
  data: { name: string; description: string },
): Promise<void> {
  await openGoalList(page, surface);
  await page.getByTestId('create-goal-entry').click();

  const dialog = page.getByTestId('goal-panel-form');
  await expect(dialog).toBeVisible();
  await page.getByTestId('goal-name-input').fill(data.name);
  await page.getByTestId('goal-description-input').fill(data.description);
  await page.getByTestId('save-goal-button').click();
  await expect(dialog).toBeHidden();
}

export async function editGoal(
  page: Page,
  goalName: string,
  updates: { name?: string; description?: string },
): Promise<void> {
  await openContextMenuAction(page, goalName, /编辑|Edit/i);

  const dialog = page.getByTestId('goal-panel-form');
  await expect(dialog).toBeVisible();

  if (updates.name !== undefined) {
    await page.getByTestId('goal-name-input').clear();
    await page.getByTestId('goal-name-input').fill(updates.name);
  }

  if (updates.description !== undefined) {
    await page.getByTestId('goal-description-input').clear();
    await page.getByTestId('goal-description-input').fill(updates.description);
  }

  await page.getByTestId('save-goal-button').click();
  await expect(dialog).toBeHidden();
}

export async function deleteGoal(page: Page, goalName: string): Promise<void> {
  await openContextMenuAction(page, goalName, /删除|Delete/i);
  await confirmDelete(page);
}

export async function goalExists(page: Page, goalName: string): Promise<boolean> {
  return (await goalCard(page, goalName).count()) > 0;
}

async function refreshWebGoalList(page: Page, surface: GoalSurface): Promise<void> {
  if (surface !== 'web') {
    return;
  }

  // The Web goal list has no refresh control (GOAL-5101 removed it) and no
  // realtime invalidation, so the server list can only be re-read by reloading
  // the route. Desktop refreshes itself through the PowerSync change broadcast.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('goal-list-view')).toBeVisible();
  await expect(page.getByTestId('goal-list-skeleton')).toBeHidden({ timeout: 15_000 });
}

export async function waitForGoalVisible(
  page: Page,
  surface: GoalSurface,
  goalName: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await refreshWebGoalList(page, surface);
        return await goalExists(page, goalName);
      },
      {
        timeout: 30_000,
        message: `Timed out waiting for goal "${goalName}" to appear.`,
      },
    )
    .toBe(true);
}

export async function waitForGoalHidden(
  page: Page,
  surface: GoalSurface,
  goalName: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await refreshWebGoalList(page, surface);
        return await goalExists(page, goalName);
      },
      {
        timeout: 30_000,
        message: `Timed out waiting for goal "${goalName}" to disappear.`,
      },
    )
    .toBe(false);
}

export async function deleteGoalIfPresent(
  page: Page,
  surface: GoalSurface,
  goalName: string,
): Promise<void> {
  // Cleanup stays idempotent because sync regression tests may fail midway and
  // reruns should not depend on a perfectly clean prior state.
  await openGoalList(page, surface);

  if (!(await goalExists(page, goalName))) {
    return;
  }

  await deleteGoal(page, goalName);
  await waitForGoalHidden(page, surface, goalName);
}
