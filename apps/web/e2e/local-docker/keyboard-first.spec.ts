import { expect, test } from '@playwright/test';
import { registerAndLogin } from '../helpers/testHelpers';

test('Keyboard-first V1: preview, input protection, commands and device overrides', async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, {
    email: `keyboard-${suffix}@test.com`,
    password: 'Test123456!',
    landingPath: '/',
  });
  await page.evaluate(() =>
    localStorage.setItem(
      'presentation-preference',
      JSON.stringify({ locale: 'zh-CN', theme: 'auto' }),
    ),
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  const composer = page.getByTestId('ai-chat-composer');
  await composer.pressSequentially('1234jk');
  await expect(composer).toHaveValue('1234jk');
  await expect(page.locator('[data-capsule-preview-content]')).toHaveCount(0);
  await composer.fill('');
  await page.getByTestId('capsule-nav-goal').focus();
  const home = page.url();
  await page.keyboard.press('1');
  await expect(page.getByTestId('goal-capsule-preview')).toBeVisible();
  expect(page.url()).toBe(home);
  await page.keyboard.press('2');
  await expect(page.getByTestId('goal-capsule-preview')).toBeHidden();
  await expect(page.getByTestId('task-capsule-preview')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByTestId('task-capsule-preview')).toBeHidden();
  for (const [key, module] of [
    ['3', 'routine'],
    ['4', 'note'],
    ['9', 'schedule'],
    ['0', 'notification'],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByTestId(`${module}-capsule-preview`)).toBeVisible();
    expect(page.url()).toBe(home);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-capsule-preview-content]')).toHaveCount(0);
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/goals$/);
  await page.goto('/goals?dialog=goal');
  await expect(page.getByTestId('goal-dialog')).toBeVisible();
  await page.getByTestId('goal-name-input').fill(`Keyboard goal ${suffix}`);
  await page.getByTestId('save-goal-button').click();
  await expect(page.getByTestId('goal-dialog')).toBeHidden();
  const goalRow = page
    .getByTestId('goal-progress-row')
    .filter({ hasText: `Keyboard goal ${suffix}` });
  await expect(goalRow).toBeVisible();
  const goalId = await goalRow.getAttribute('data-goal-id');
  await page.locator('[data-testid="goal-list"]').focus();
  await page.keyboard.press('j');
  await expect(goalRow.locator('[data-keyboard-item]')).toBeFocused();
  await page.keyboard.press('x');
  await expect(goalRow.locator('[data-keyboard-item]')).toHaveAttribute(
    'data-keyboard-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/goals/${goalId}$`));
  await page.keyboard.press('Alt+2');
  await expect(page).toHaveURL(/\/tasks$/);
  await page.keyboard.press('1');
  await expect(page.getByTestId(`goal-capsule-item-${goalId}`)).toBeVisible();
  await page.keyboard.press('j');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/goals/${goalId}$`));
  await page.keyboard.press('Alt+2');
  await page.keyboard.press('Alt+1');
  await expect(page).toHaveURL(new RegExp(`/goals/${goalId}$`));
  await page.keyboard.press('Alt+2');
  await expect(page).toHaveURL(/\/tasks$/);

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox').fill('快捷键设置');
  await page.getByRole('option', { name: /快捷键设置/ }).click();
  await expect(page.getByTestId('keyboard-settings')).toBeVisible();
  const search = page.getByRole('textbox', { name: '搜索快捷键' });
  await search.pressSequentially('1234jk');
  await expect(search).toHaveValue('1234jk');
  await expect(page.locator('[data-capsule-preview-content]')).toHaveCount(0);
  await search.fill('进入目标');
  await page.getByRole('button', { name: '录制：进入目标', exact: true }).click();
  await page.keyboard.press('Alt+g');
  const saveBinding = page.getByRole('button', { name: '保存', exact: true });
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press('Tab');
    if (await saveBinding.evaluate((button) => button === document.activeElement)) break;
  }
  await expect(saveBinding).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('keyboard-settings-status')).toContainText('已保存');
  await expect(page.getByTestId('shortcut-module.goal.activate')).toContainText('Alt+G');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('shortcut-module.goal.activate')).toContainText('Alt+G');
  await page.getByTestId('settings-return-to-app').click();
  await page.getByTestId('capsule-nav-task').click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.keyboard.press('Alt+1');
  await expect(page).toHaveURL(/\/tasks$/);
  await page.keyboard.press('Alt+g');
  await expect(page).toHaveURL(new RegExp(`/goals/${goalId}$`));
  await page.keyboard.press('?');
  await expect(page.getByTestId('keyboard-help')).toBeVisible();
  await expect(page.getByTestId('keyboard-help')).toContainText('Alt+G');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('keyboard-help')).toBeHidden();
});
