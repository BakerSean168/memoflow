import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DesktopGuestShellController } from './helpers/desktop-guest';

test('desktop keyboard preview and Profile-scoped keymap survive renderer reload', async () => {
  const desktop = new DesktopGuestShellController(
    path.join(os.tmpdir(), `memoflow-keyboard-${Date.now()}`),
  );
  try {
    const page = await desktop.launch();
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('capsule-nav-goal').focus();
    await page.keyboard.press('1');
    await expect(page.getByTestId('goal-capsule-preview')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/goals$/);
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('快捷键设置');
    await page.getByRole('option', { name: /快捷键设置/ }).click();
    await expect(page.getByTestId('keyboard-settings')).toBeVisible();
    await page.getByRole('button', { name: '录制：进入目标', exact: true }).click();
    await page.keyboard.press('Alt+g');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByTestId('keyboard-settings-status')).toContainText('已保存');
    await page.reload();
    await expect(page.getByTestId('shortcut-module.goal.activate')).toContainText('Alt+G');
    await page.getByTestId('settings-return-to-app').click();
    await page.keyboard.press('Alt+2');
    await expect(page).toHaveURL(/#\/tasks$/);
    await page.keyboard.press('Alt+g');
    await expect(page).toHaveURL(/#\/goals$/);
  } finally {
    await desktop.close();
  }
});
