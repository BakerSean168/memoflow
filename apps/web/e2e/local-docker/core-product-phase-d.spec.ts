import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

test.describe('Local Docker core product Phase D', () => {
  test('[P2] completes the shared Goal/KR/Task forms with keyboard and accessible product language', async ({
    page,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const goalName = `[PM-D] 键盘目标 ${suffix}`;
    const keyResultName = `[PM-D] 首个关键结果 ${suffix}`;
    const taskPlanName = `[PM-D] 键盘任务计划 ${suffix}`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await registerAndLogin(page, {
      email: `pm-phase-d-${suffix}@test.com`,
      password,
      landingPath: '/goals',
    });
    await page.evaluate(() => {
      localStorage.setItem(
        'presentation-preference',
        JSON.stringify({ locale: 'zh-CN', theme: 'auto' }),
      );
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expectNoSeriousAxeViolations(page, '[data-testid="business-panel"]');

    const createGoal = page.getByTestId('create-goal-entry');
    await tabTo(page, createGoal);
    await page.keyboard.press('Enter');

    const goalDialog = page.getByTestId('goal-dialog');
    await expect(goalDialog).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toBeFocused();
    await expect(page.getByLabel('开始日期', { exact: true })).toBeVisible();
    await expect(page.getByLabel('截止日期', { exact: true })).toBeVisible();
    await expectDialogGeometry(goalDialog);
    await expectNoSeriousAxeViolations(page, '[data-testid="goal-dialog"]');

    await page.keyboard.type(goalName);
    await tabTo(page, page.getByTestId('add-key-result-entry'));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('key-result-draft-form')).toBeVisible();
    await tabTo(page, page.getByTestId('draft-kr-title-input'));
    await page.keyboard.type(keyResultName);
    await page.getByTestId('draft-kr-target-input').fill('1');
    await tabTo(page, page.getByTestId('save-key-result-draft'));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('key-result-draft-form')).toBeHidden();
    await expect(goalDialog).toContainText(keyResultName);
    await expect(goalDialog).toContainText('0 → 1');
    await expect(goalDialog).not.toContainText(/Incremental|Absolute|Binary|Moderate|Vital|Minor/);

    await tabTo(page, page.getByTestId('save-goal-button'));
    await page.keyboard.press('Enter');
    await expect(goalDialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(createGoal).toBeFocused();
    await expect(
      page.getByTestId('goal-progress-row').filter({ has: page.getByText(goalName, { exact: true }) }),
    ).toBeVisible();

    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('task-management-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    const createTaskPlan = page.getByTestId('create-task-template-button');
    await tabTo(page, createTaskPlan);
    await page.keyboard.press('Enter');
    const taskDialog = page.getByTestId('task-template-dialog');
    await expect(taskDialog).toBeVisible();
    await expect(page.getByTestId('task-template-title-input')).toBeFocused();
    await expect(page.getByTestId('task-form-advanced-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(taskDialog.getByText('提醒设置', { exact: true })).toHaveCount(0);
    await expectDialogGeometry(taskDialog);
    await expectNoSeriousAxeViolations(page, '[data-testid="task-template-dialog"]');

    await page.keyboard.type(taskPlanName);
    await tabTo(page, page.getByTestId('task-dialog-save-button'));
    await page.keyboard.press('Enter');
    await expect(taskDialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(createTaskPlan).toBeFocused();
    await expect(page.getByText(taskPlanName, { exact: true })).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expectNoSeriousAxeViolations(page, '[data-testid="business-panel"]');

    await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
    const aiSettings = page.getByTestId('ai-settings-panel');
    await expect(aiSettings).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expectNoSeriousAxeViolations(page, '[data-testid="ai-settings-panel"]');

    await testInfo.attach('phase-d-forms-1280x720', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

async function tabTo(page: Page, target: Locator, maxTabs = 60): Promise<void> {
  await expect(target).toBeVisible();
  for (let index = 0; index < maxTabs; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${await target.getAttribute('data-testid')} by keyboard`);
}

async function expectDialogGeometry(dialog: Locator, noBodyScroll = false): Promise<void> {
  const readGeometry = () =>
    dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector<HTMLElement>('[data-testid="product-dialog-body"]');
      const footer = element.querySelector<HTMLElement>('[data-testid="product-dialog-footer"]');
      const footerRect = footer?.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        bodyClientHeight: body?.clientHeight ?? 0,
        bodyScrollHeight: body?.scrollHeight ?? 0,
        footerTop: footerRect?.top ?? 0,
        footerBottom: footerRect?.bottom ?? 0,
      };
    });

  await expect.poll(async () => (await readGeometry()).top).toBeGreaterThanOrEqual(0);
  const geometry = await readGeometry();

  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.top);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  if (noBodyScroll) {
    expect(geometry.bodyScrollHeight).toBeLessThanOrEqual(geometry.bodyClientHeight + 1);
  }
}

async function expectNoSeriousAxeViolations(page: Page, include: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious,
    serious
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
            .join('\n')}`,
      )
      .join('\n\n'),
  ).toEqual([]);
}
