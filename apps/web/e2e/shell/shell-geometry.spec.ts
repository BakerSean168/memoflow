/**
 * Electron shell geometry / interaction matrix (UI 重构诊断修订 §15.2 / S2+S6)
 *
 * Guest-mode only — no sync credentials / live API.
 * Requires a built desktop entrypoint at apps/desktop/dist-electron/main.cjs.
 */
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { boxOf, containsBox, DesktopGuestShellController } from './helpers/desktop-guest';

const CHAT_MIN = 420;
const PANEL_MIN = 360;
const COMPOSER_MAX = 740;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_SHOT_DIR = path.resolve(__dirname, '..', '..', 'test-results', 'shell-matrix');

const MODULE_ROUTES: Record<string, string> = {
  goal: '/goals',
  task: '/tasks',
  note: '/repository',
  reminder: '/reminders',
  notification: '/notifications',
};

async function openModuleFromCapsule(page: Page, moduleId: string): Promise<void> {
  await page.getByTestId(`capsule-nav-${moduleId}`).click();
  const route = MODULE_ROUTES[moduleId];
  if (!route) throw new Error(`No route for module "${moduleId}"`);
  await page.waitForURL((url) => url.hash.includes(route), { timeout: 15_000 });
  await expect(page.getByTestId('business-panel')).toBeVisible({ timeout: 15_000 });
}

async function dragPanelToExtreme(page: Page, direction: 'max' | 'min'): Promise<void> {
  const resizer = page.getByTestId('business-panel-resizer');
  await expect(resizer).toBeVisible();
  await resizer.hover();
  const box = await resizer.boundingBox();
  if (!box) throw new Error('business-panel-resizer has no box');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // max panel => drag left; min panel => drag right
  const endX = direction === 'max' ? 40 : box.x + 900;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, startY, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

function asciiUserDataDir(testInfo: { workerIndex: number; retry: number }): string {
  // Electron on Windows can hard-crash (0xC0000409) when userData contains non-ASCII
  // characters. Playwright's default outputPath embeds sanitized test titles (e.g. >=),
  // so always pin guest profile data under an ASCII-only temp path.
  return path.join(
    os.tmpdir(),
    'memoflow-shell-e2e',
    `w${testInfo.workerIndex}-r${testInfo.retry}-${Date.now()}`,
  );
}

async function openStandaloneSettings(page: Page, tab?: string): Promise<void> {
  const hash = tab ? `#/settings?tab=${tab}` : '#/settings';
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await expect(page.getByTestId('standalone-settings-layout')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-scene', 'settings');
}

async function saveMatrixShot(page: Page, name: string): Promise<void> {
  mkdirSync(MATRIX_SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(MATRIX_SHOT_DIR, name),
    fullPage: false,
  });
}

async function expectGoalToolbarToFit(page: Page): Promise<void> {
  const toolbar = page.getByTestId('goal-page-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(page.locator('[data-primary-action="create-goal"]:visible')).toHaveCount(1);
  const metrics = await toolbar.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test.describe.configure({ mode: 'serial' });

test.describe('Electron shell geometry matrix', () => {
  let desktop: DesktopGuestShellController;

  test.beforeEach(async ({}, testInfo) => {
    desktop = new DesktopGuestShellController(asciiUserDataDir(testInfo));
    await desktop.launch({ width: 1200, height: 800 });
    await desktop.enterGuestAndWaitForShell();
  });

  test.afterEach(async () => {
    await desktop.close();
  });

  test('[P0] 1200x800 panel drag preserves minimums and collapses past the threshold', async () => {
    const page = desktop.page;
    await desktop.setWindowSize({ width: 1200, height: 800 });

    await expect(page.getByTestId('conversation-sidebar')).toBeVisible();
    await openModuleFromCapsule(page, 'task');

    const shell = page.getByTestId('app-shell');
    await expect(shell).toHaveAttribute('data-shell-state', 'split');

    const panel = await boxOf(page, 'business-panel');
    expect(panel.width).toBeGreaterThanOrEqual(440);
    expect(panel.width).toBeLessThanOrEqual(490);

    const aiBefore = await boxOf(page, 'shell-ai-column');
    expect(aiBefore.width).toBeGreaterThanOrEqual(CHAT_MIN);

    const composer = await boxOf(page, 'global-composer');
    expect(containsBox(aiBefore, composer, 4)).toBe(true);

    // Composer host should not exceed AI column (inline mode is full AI width).
    expect(composer.width).toBeLessThanOrEqual(aiBefore.width + 2);

    await dragPanelToExtreme(page, 'max');
    const aiMax = await boxOf(page, 'shell-ai-column');
    const panelMax = await boxOf(page, 'business-panel');
    expect(aiMax.width).toBeGreaterThanOrEqual(CHAT_MIN - 1);
    expect(panelMax.width).toBeGreaterThanOrEqual(PANEL_MIN);

    const composerMax = await boxOf(page, 'global-composer');
    expect(containsBox(aiMax, composerMax, 4)).toBe(true);

    await dragPanelToExtreme(page, 'min');
    await expect(page.getByTestId('business-panel')).toBeHidden();
    await page.getByTestId('shell-right-panel-toggle').click();
    await expect(page.getByTestId('business-panel')).toBeVisible();
    const panelRestored = await boxOf(page, 'business-panel');
    expect(panelRestored.width).toBeGreaterThanOrEqual(PANEL_MIN - 1);

    await saveMatrixShot(page, '1200x800-split-task.png');
  });

  test('[P0] Settings independent scene has no panel/sidebar/AI/composer', async () => {
    const page = desktop.page;
    await desktop.setWindowSize({ width: 1200, height: 800 });

    await openModuleFromCapsule(page, 'task');
    await openStandaloneSettings(page);

    await expect(page.getByTestId('business-panel')).toHaveCount(0);
    await expect(page.getByTestId('conversation-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-view')).toHaveCount(0);
    await expect(page.getByTestId('global-composer')).toHaveCount(0);
    await expect(page.getByTestId('ai-footer-composer')).toHaveCount(0);

    await page.getByTestId('settings-return-to-app').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-scene', 'workspace');
    await expect(page.getByTestId('business-panel')).toBeVisible();
    await expect(page.getByTestId('ai-chat-view')).toBeVisible();
  });

  test('[P0] 900x600 module entry uses focus; floating composer <= COMPOSER_MAX', async () => {
    const page = desktop.page;
    await desktop.setWindowSize({ width: 900, height: 600 });
    await page.waitForTimeout(300);

    await openModuleFromCapsule(page, 'task');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await expect(page.getByTestId('conversation-sidebar')).toHaveCount(0);

    // AI column hidden in focus, but floating GlobalComposer is present.
    const composer = page.getByTestId('global-composer');
    await expect(composer).toBeVisible();
    await expect(composer).toHaveAttribute('data-composer-mode', 'floating');

    const composerBox = await boxOf(page, 'global-composer-mount');
    expect(composerBox.width).toBeLessThanOrEqual(COMPOSER_MAX + 2);

    const workspace = await boxOf(page, 'shell-workspace-main');
    // Floating host is centered in workspace main (not full window).
    const composerCenter = composerBox.x + composerBox.width / 2;
    const workspaceCenter = workspace.x + workspace.width / 2;
    expect(Math.abs(composerCenter - workspaceCenter)).toBeLessThanOrEqual(24);

    await saveMatrixShot(page, '900x600-focus-task.png');

    // Settings narrow navigation still independent.
    await openStandaloneSettings(page);
    await expect(page.getByTestId('settings-return-to-app')).toBeVisible();
    await expect(page.getByTestId('settings-scene-rail')).toHaveCount(0);
    await expect(page.getByTestId('global-composer')).toHaveCount(0);
  });

  test('[P0] 1024 and 1440 viewports keep legal panel/AI geometry', async () => {
    const page = desktop.page;

    // 1024 with sidebar open cannot split (workspace too narrow) -> focus.
    await desktop.setWindowSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    await openModuleFromCapsule(page, 'goal');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    const composer1024 = page.getByTestId('global-composer');
    await expect(composer1024).toBeVisible();
    await expect(composer1024).toHaveAttribute('data-composer-mode', 'floating');
    const composerBox1024 = await boxOf(page, 'global-composer-mount');
    expect(composerBox1024.width).toBeLessThanOrEqual(COMPOSER_MAX + 2);
    await saveMatrixShot(page, '1024x768-focus-goal.png');

    // Return to chat-only then resize wide.
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.waitForTimeout(200);

    await desktop.setWindowSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await openModuleFromCapsule(page, 'task');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'split');

    const panel = await boxOf(page, 'business-panel');
    const ai = await boxOf(page, 'shell-ai-column');
    expect(panel.width).toBeGreaterThanOrEqual(PANEL_MIN);
    expect(ai.width).toBeGreaterThanOrEqual(CHAT_MIN);

    const composer = await boxOf(page, 'global-composer');
    expect(containsBox(ai, composer, 4)).toBe(true);

    await dragPanelToExtreme(page, 'max');
    const aiMax = await boxOf(page, 'shell-ai-column');
    expect(aiMax.width).toBeGreaterThanOrEqual(CHAT_MIN - 1);
    await saveMatrixShot(page, '1440x900-split-task.png');
  });

  test('[P0] Goal keeps one toolbar DOM across split resize and focus', async () => {
    const page = desktop.page;
    await desktop.setWindowSize({ width: 1440, height: 900 });
    await openModuleFromCapsule(page, 'goal');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'split');

    const toolbar = page.getByTestId('goal-page-toolbar');
    await expectGoalToolbarToFit(page);
    await toolbar.evaluate((element) => {
      element.setAttribute('data-instance-probe', 'stable');
    });

    await dragPanelToExtreme(page, 'max');
    await expectGoalToolbarToFit(page);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');

    await dragPanelToExtreme(page, 'min');
    await expectGoalToolbarToFit(page);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await expectGoalToolbarToFit(page);
    await expect(toolbar).toHaveAttribute('data-instance-probe', 'stable');

    await saveMatrixShot(page, '1440x900-focus-goal-single-toolbar.png');
  });

  test('[P1] Account menu opens independent Settings scene', async () => {
    const page = desktop.page;
    await desktop.setWindowSize({ width: 1200, height: 800 });

    await page.getByTestId('shell-account-menu').click();
    await expect(page.getByTestId('shell-open-settings')).toBeVisible();
    await page.getByTestId('shell-open-settings').click();

    await expect(page.getByTestId('standalone-settings-layout')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-scene', 'settings');
    await expect(page.getByTestId('business-panel')).toHaveCount(0);
    await expect(page.getByTestId('conversation-sidebar')).toHaveCount(0);
  });

  test('[P1] Theme light/dark and language zh/en apply on document root', async () => {
    const page = desktop.page;
    await desktop.setWindowSize({ width: 1200, height: 800 });

    await openStandaloneSettings(page, 'appearance');
    await expect(page.getByTestId('appearance-settings-card')).toBeVisible({ timeout: 15_000 });

    // Theme: dark
    await page.getByTestId('appearance-theme-trigger').click();
    await page.getByTestId('appearance-theme-option-dark').click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('dark');
    await saveMatrixShot(page, '1200-theme-dark-zh.png');

    // Theme: light
    await page.getByTestId('appearance-theme-trigger').click();
    await page.getByTestId('appearance-theme-option-light').click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(false);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('light');
    await saveMatrixShot(page, '1200-theme-light-zh.png');

    // Language: English (LocaleSettings sits under appearance tab)
    const languageTrigger = page.locator('#language-select');
    await expect(languageTrigger).toBeVisible();
    await languageTrigger.click();
    await page.getByRole('option', { name: 'English' }).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toMatch(/^en/i);

    // Shell chrome should reflect English copy after return.
    await page.getByTestId('settings-return-to-app').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-scene', 'workspace');
    // Account control remains reachable after the shell returns.
    await expect(page.getByTestId('shell-account-menu')).toBeVisible();
    await saveMatrixShot(page, '1200-theme-light-en-workspace.png');

    // Switch back to Chinese for isolation of later serial tests (serial suite is fine either way).
    await openStandaloneSettings(page, 'appearance');
    await languageTrigger.click();
    await page.getByRole('option', { name: '简体中文' }).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toMatch(/^zh/i);
  });
});
