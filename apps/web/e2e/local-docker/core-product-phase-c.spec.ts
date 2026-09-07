import { expect, test, type Locator } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

test.describe('Local Docker core product Phase C', () => {
  test('[P1] keeps Home, navigation, panel preference, drafts, and Focus independent', async ({
    page,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draftTitle = `[PM-C] Preserved goal draft ${suffix}`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await registerAndLogin(page, {
      email: `pm-phase-c-${suffix}@test.com`,
      password,
      landingPath: '/',
    });
    await page.evaluate(() => {
      localStorage.setItem(
        'presentation-preference',
        JSON.stringify({ locale: 'zh-CN', theme: 'auto' }),
      );
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

    const panel = page.getByTestId('business-panel');
    const panelToggle = page.getByTestId('shell-right-panel-toggle');
    const aiPanel = page.getByTestId('ai-message-panel');

    await expect(panel).toBeVisible();
    await expect(page.getByTestId('today-overview-panel')).toBeVisible();
    await expect(page.getByTestId('today-overview-widgets')).toBeVisible();
    await expect(aiPanel.getByTestId('daily-todo-widget')).toHaveCount(0);
    await expect(panelToggle).toHaveAttribute('aria-label', '隐藏右侧面板');
    await expect(panelToggle).toHaveAttribute('aria-pressed', 'true');

    await expect(page.getByTestId('ai-welcome-no-model')).toBeVisible();
    await expect(page.getByTestId('ai-welcome-configure-ai')).toHaveText('配置 AI');
    await expect(page.getByTestId('ai-welcome-create-goal')).toHaveText('创建第一个目标');
    await expect(page.getByTestId('ai-welcome-quick-task')).toHaveText('添加今日任务');
    await expect(page.getByText('尚未配置可用模型。请先在设置中接入 AI 服务商。')).toHaveCount(0);
    await expectComposerGeometry(page.getByTestId('ai-footer-composer'));

    await panelToggle.click();
    await expect(panel).toBeHidden();
    await expect(panelToggle).toHaveAttribute('aria-label', '显示右侧面板');
    await expect(panelToggle).toHaveAttribute('aria-pressed', 'false');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(panel).toBeHidden();
    await expect(panelToggle).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('ai-welcome-create-goal').click();
    await page.waitForURL('**/goals?dialog=goal', { timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('goal-dialog')).toBeVisible();
    await page.getByTestId('goal-name-input').fill(draftTitle);

    let dismissedPrompt = '';
    page.once('dialog', async (dialog) => {
      dismissedPrompt = dialog.message();
      await dialog.dismiss();
    });
    // The goal form is intentionally modal, so its overlay owns pointer input. Force the
    // shell control here to exercise the cross-surface dirty-state contract itself.
    await panelToggle.dispatchEvent('click');
    expect(dismissedPrompt).toContain('未保存内容');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draftTitle);

    let acceptedPrompt = '';
    page.once('dialog', async (dialog) => {
      acceptedPrompt = dialog.message();
      await dialog.accept();
    });
    await panelToggle.dispatchEvent('click');
    expect(acceptedPrompt).toContain('未保存内容');
    await expect(panel).toBeHidden();

    await panelToggle.dispatchEvent('click');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draftTitle);
    await page.getByTestId('goal-dialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByTestId('goal-dialog')).toBeHidden();

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await expect(page.getByTestId('conversation-sidebar')).toBeVisible();
    await expect(page.getByTestId('shell-ai-column')).toBeHidden();
    await expect(page.getByTestId('shell-ai-column')).toHaveCount(1);
    await expect(page.getByTestId('global-composer')).toBeVisible();
    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'split');
    await expect(page.getByTestId('shell-ai-column')).toBeVisible();

    await page.getByTestId('business-panel-tab-close').click();
    await page.waitForURL(/\/$/, { timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('today-overview-panel')).toBeVisible();

    await panelToggle.click();
    await expect(panel).toBeHidden();
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('task-management-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    await testInfo.attach('phase-c-shell-1280x720', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

async function expectComposerGeometry(composer: Locator): Promise<void> {
  await expect(composer).toBeVisible();
  const geometry = await composer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const cue = element.querySelector('[data-testid="ai-chat-empty-models-cue"]');
    const cueRect = cue?.getBoundingClientRect();
    return {
      composerHeight: rect.height,
      composerBottom: rect.bottom,
      viewportHeight: window.innerHeight,
      cueHeight: cueRect?.height ?? 0,
      cueWidth: cueRect?.width ?? 0,
    };
  });

  expect(geometry.composerHeight).toBeLessThanOrEqual(160);
  expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.cueHeight).toBeLessThanOrEqual(40);
  expect(geometry.cueWidth).toBeGreaterThan(0);
}
