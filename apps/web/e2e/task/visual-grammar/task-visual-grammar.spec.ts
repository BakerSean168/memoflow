import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '') {
  await page.clock.setFixedTime(new Date('2026-09-30T01:00:00Z'));
  await page.goto(`/?${query}`);
  await expect(
    page.getByTestId(query.includes('state=create') ? 'task-plan-dialog' : 'task-detail-metadata'),
  ).toBeVisible();
}
async function capture(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    await page
      .locator('[data-testid="task-detail-scroll-host"], [data-testid="product-dialog-body"]')
      .evaluateAll((elements) =>
        elements.every((element) => element.scrollWidth <= element.clientWidth),
      ),
  ).toBe(true);
}
async function evidence(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        taskGrammarEvidence(): { calls: Record<string, unknown>[]; route: string };
      }
    ).taskGrammarEvidence(),
  );
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  Object.assign(page, { grammarErrors: errors });
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { grammarErrors: string[] }).grammarErrors).toEqual([]);
});

for (const locale of ['en-US', 'zh-CN']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 1280]) {
      test(`${locale} ${theme} ${width}: create and detail property grammar`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const query = `locale=${locale}&theme=${theme}`;
        await open(page, `${query}&state=create`);
        await capture(page, 'create');
        await page.getByTestId('task-importance-chip').click();
        await expect(page.getByTestId('task-importance-option-Important')).toBeVisible();
        await capture(page, 'create-property-edit');
        await open(page, query);
        await capture(page, 'detail');
        const recent = page.getByTestId('task-detail-occurrences');
        await recent.scrollIntoViewIfNeeded();
        await expect(
          recent.getByRole('heading', {
            name: locale === 'zh-CN' ? '最近执行' : 'Recent activity',
            exact: true,
          }),
        ).toBeVisible();
        await expect(recent).toContainText(
          locale === 'zh-CN' ? '并非完整历史' : 'not the full history',
        );
        await capture(page, 'recent-activity');
        await page.getByTestId('task-detail-metadata').scrollIntoViewIfNeeded();
        for (const row of ['task-goal-row', 'task-labels-row', 'task-reminders-row']) {
          await expect(page.getByTestId(row)).toBeVisible();
        }
        await page.getByTestId('task-detail-labels-chip').focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await capture(page, 'labels-edit');
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('task-detail-labels-chip')).toBeFocused();
        await page.getByTestId('task-detail-reminder-chip').click();
        await expect(page.getByTestId('task-reminder-enabled')).toBeVisible();
        await capture(page, 'reminders-edit');
        await page.keyboard.press('Escape');
        await page.getByTestId('task-detail-goal-chip').click();
        await expect(page.getByTestId('task-goal-binding-toggle')).toBeVisible();
        expect((await evidence(page)).route).toBe('task-detail');
        expect((await evidence(page)).calls).toEqual([]);
        await capture(page, 'binding-edit');
        await page.keyboard.press('Escape');
        await page.getByTestId('task-goal-owner-navigation').click();
        await expect(page.getByTestId('goal-owner-destination')).toBeVisible();
        expect((await evidence(page)).calls).toEqual([]);
        await open(page, `${query}&state=empty`);
        for (const row of ['task-goal-row', 'task-labels-row', 'task-reminders-row']) {
          await expect(page.getByTestId(row)).toHaveCount(0);
        }
        await capture(page, 'detail-optional-hidden');
        await page.getByTestId('task-properties-more').click();
        await page
          .getByRole('menuitem', { name: locale === 'zh-CN' ? '标签' : 'Labels', exact: true })
          .focus();
        await page.keyboard.press('ArrowRight');
        await page
          .getByRole('menuitem', {
            name: locale === 'zh-CN' ? '创建或管理标签…' : 'Create or manage labels…',
            exact: true,
          })
          .focus();
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('task-labels-row')).toBeVisible();
        await capture(page, 'optional-revealed');
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('task-labels-row')).toHaveCount(0);
        for (const optional of [
          {
            parent: locale === 'zh-CN' ? '关联 Goal' : 'Linked Goal',
            editor: locale === 'zh-CN' ? '更多关联设置…' : 'More binding settings…',
            row: 'task-goal-row',
            capture: 'goal-revealed',
          },
          {
            parent: locale === 'zh-CN' ? '提醒' : 'Reminders',
            editor: locale === 'zh-CN' ? '更多提醒设置…' : 'More reminder settings…',
            row: 'task-reminders-row',
            capture: 'reminders-revealed',
          },
        ]) {
          await page.getByTestId('task-properties-more').click();
          await page.getByRole('menuitem', { name: optional.parent, exact: true }).focus();
          await page.keyboard.press('ArrowRight');
          await page.getByRole('menuitem', { name: optional.editor, exact: true }).focus();
          await page.keyboard.press('Enter');
          await expect(page.getByTestId(optional.row)).toBeVisible();
          await capture(page, optional.capture);
          await page.keyboard.press('Escape');
          await expect(page.getByTestId(optional.row)).toHaveCount(0);
        }
      });
    }
  }
}

test('value editors save only their property; missing owner cannot navigate', async ({ page }) => {
  await open(page);
  await page.getByTestId('task-detail-labels-chip').click();
  await page.getByRole('option').filter({ hasText: 'Weekly review' }).click();
  await expect.poll(async () => (await evidence(page)).calls).toEqual([{ labelIds: ['label-1'] }]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('task-detail-labels-chip')).not.toContainText('Weekly review');
  await page.getByTestId('task-detail-reminder-chip').click();
  await page.getByTestId('task-reminder-enabled').click();
  await expect.poll(async () => (await evidence(page)).calls.length).toBe(2);
  expect(Object.keys((await evidence(page)).calls[1]!)).toEqual(['reminderConfig']);
  await page.keyboard.press('Escape');
  await page.getByTestId('task-detail-goal-chip').click();
  await page.getByTestId('task-goal-binding-toggle').click();
  await expect.poll(async () => (await evidence(page)).calls.length).toBe(3);
  expect((await evidence(page)).calls[2]).toEqual({ goalBinding: null });
  await open(page, 'owner=missing');
  await expect(page.getByTestId('task-goal-owner-navigation')).toHaveCount(0);
  await page.getByTestId('task-detail-goal-chip').click();
  await expect(page.getByTestId('task-goal-binding-toggle')).toBeVisible();
  expect((await evidence(page)).route).toBe('task-detail');
});

test('archived Plan disables property editing while owner navigation remains available', async ({
  page,
}) => {
  await open(page, 'state=archived');
  for (const property of ['goal', 'labels', 'reminder', 'schedule', 'recurrence', 'importance']) {
    await expect(page.getByTestId(`task-detail-${property}-chip`)).toBeDisabled();
  }
  await expect(page.getByTestId('task-goal-owner-navigation')).toBeEnabled();
});

test('pending property mutation disables other edit triggers', async ({ page }) => {
  await open(page, 'busy=true');
  await page.getByTestId('task-detail-labels-chip').click();
  await page.getByRole('option').filter({ hasText: 'Weekly review' }).click();
  await expect(page.getByTestId('task-detail-goal-chip')).toBeDisabled();
  await expect(page.getByTestId('task-detail-reminder-chip')).toBeDisabled();
  await expect(page.getByTestId('task-detail-goal-chip')).toBeEnabled();
});
