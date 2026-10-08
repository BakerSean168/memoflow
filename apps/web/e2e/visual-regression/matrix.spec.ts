import { expect, test } from '@playwright/test';
import { matrix, validateMatrix } from './manifest.mjs';
import { openVisualCase, waitForVisualLayout } from './environment';
validateMatrix(matrix);
for (const entry of matrix) {
  test(entry.id, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const externalRequests = await openVisualCase(page, entry);
    await expect(page.getByTestId(entry.ready))
      .toBeVisible({ timeout: 10_000 })
      .catch((error: Error) => {
        throw new Error(`${error.message}\nFixture errors: ${errors.join('; ')}`);
      });
    switch (entry.surface) {
      case 'specialized.ai-native':
        await expect(page.getByTestId('task-plan-dialog')).toBeHidden();
        await page.getByTestId('task-open-native-review').click();
        await expect(page.getByTestId('task-plan-dialog')).toBeVisible();
        await expect(page.getByTestId('task-plan-title-input')).toHaveValue(
          'Review measured progress',
        );
        break;
      case 'overlay.goal-record':
        await page.getByTestId('goal-quick-check-in-kr-0').click();
        await expect(page.getByTestId('goal-record-dialog')).toBeVisible();
        await page.locator('#change-amount').fill('2');
        break;
      case 'overlay.goal-kr':
        await page
          .getByTestId('goal-kr-summary-kr-0')
          .getByRole('button', { name: '更多', exact: true })
          .click();
        await page.getByTestId('goal-kr-detail-kr-0').click();
        await expect(page.getByTestId('goal-kr-inspect')).toBeVisible();
        break;
      case 'overlay.task-inspect':
        await page.getByTestId('task-occurrence-body').click();
        await expect(page.getByTestId('task-occurrence-inspect')).toBeVisible();
        break;
      case 'overlay.task-measurement':
        await page.getByTestId('schedule-event-task-task-occurrence-1').focus();
        await page.keyboard.press('Enter');
        await expect(
          page.getByTestId(
            entry.width === 'narrow' ? 'planner-event-sheet' : 'planner-event-dialog',
          ),
        ).toBeVisible();
        if (entry.surface === 'overlay.task-measurement') {
          await page.getByTestId('task-compact-complete-task-occurrence-1').click();
          await expect(page.getByTestId('task-completion-measurement-dialog')).toBeVisible();
          await page.locator('#change-amount').fill('3');
        }
        break;
      case 'overlay.routine-editor':
        await page.getByTestId('routine-create-button').click();
        await page.getByTestId('routine-create-blank').click();
        await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
        break;
    }
    if (entry.surface.startsWith('shell.')) {
      await expect(page.getByTestId('app-shell')).toHaveAttribute(
        'data-shell-state',
        entry.surface === 'shell.focus' ? 'focus' : 'split',
      );
      await expect(page.getByTestId('business-panel')).toBeVisible();
      if (entry.surface === 'shell.narrow') {
        const box = await page.getByTestId('business-panel').boundingBox();
        expect(box!.width).toBeCloseTo(520, 0);
      }
      if (entry.surface === 'shell.capsules') {
        await page.getByTestId('capsule-schedule').hover();
        await expect(page.getByTestId('capsule-preview-schedule')).toBeVisible();
      }
    }
    await waitForVisualLayout(page);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
    await expect(page).toHaveScreenshot(`${entry.id}.png`);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
}

test('post-vNext chat header aligns with the business tab strip', async ({ page }) => {
  const entry = matrix.find((entry) => entry.surface === 'shell.split')!;
  await openVisualCase(page, entry);
  await expect(page.getByTestId('business-panel')).toBeVisible();
  await waitForVisualLayout(page);

  const chatHeader = await page.getByTestId('ai-chat-header').boundingBox();
  const businessTabs = await page.getByTestId('business-panel-tab-strip').boundingBox();
  expect(chatHeader).not.toBeNull();
  expect(businessTabs).not.toBeNull();
  expect(chatHeader!.height).toBeCloseTo(businessTabs!.height, 0);
  expect(chatHeader!.y + chatHeader!.height).toBeCloseTo(businessTabs!.y + businessTabs!.height, 0);
});

test('UI-9002 narrow shell target, keyboard and scroll ownership', async ({ page }) => {
  const entry = matrix.find((entry) => entry.surface === 'shell.narrow')!;
  await openVisualCase(page, { ...entry, query: `${entry.query}&tabs=8` });
  await expect(page.getByTestId('business-panel')).toBeVisible();
  await waitForVisualLayout(page);
  const panel = page.getByTestId('business-panel');
  expect((await panel.boundingBox())!.width).toBeCloseTo(520, 0);
  await expect(panel.getByRole('tab')).toHaveCount(8);
  await expect(panel).toHaveAttribute('data-tab-density', 'icon');
  const tab = panel.getByRole('tab').first();
  await expect(tab).toHaveAccessibleName(/.+/);
  await tab.focus();
  await page.keyboard.press('Home');
  await expect(tab).toBeFocused();
  const controls = panel.locator(
    '[data-testid="business-panel-home"], [data-testid="business-panel-focus-toggle"], [data-testid="business-panel-tab-close"]',
  );
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    await expect(control).toHaveAccessibleName(/.+/);
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(box.height).toBeGreaterThanOrEqual(32);
  }
  expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  const geometry = await panel.evaluate((element) => ({
    overflows: element.scrollWidth > element.clientWidth,
    roots: [...element.querySelectorAll<HTMLElement>('[data-surface-scroll-root]')].map((root) => ({
      name: root.dataset.surfaceScrollRoot,
      overflowY: getComputedStyle(root).overflowY,
    })),
  }));
  expect(geometry.overflows).toBe(false);
  await expect(panel.locator('[data-surface-scroll-root=business] [data-scroll-host]')).toHaveCount(
    1,
  );
  expect(geometry.roots).toEqual([
    { name: 'home', overflowY: 'hidden' },
    { name: 'business', overflowY: 'hidden' },
  ]);
  expect(
    await panel
      .getByTestId('business-panel-tab-strip')
      .evaluate((element) => getComputedStyle(element).overflowX),
  ).not.toBe('auto');
});

test('UI-9002 capsule keyboard focus and computed reduced motion', async ({ page }) => {
  const entry = matrix.find((entry) => entry.surface === 'shell.split')!;
  await openVisualCase(page, entry);
  const preview = page.getByTestId('capsule-preview-schedule');
  await expect(preview).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await preview.focus();
  await page.keyboard.press('Enter');
  const content = page.locator('[data-capsule-preview-content="schedule"]');
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute('role', 'dialog');
  expect(await content.evaluate((element) => getComputedStyle(element).animationName)).not.toBe(
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await content.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(content.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(content).toBeHidden();
  await expect(preview).toBeFocused();
  await expect(preview).toHaveAttribute('aria-expanded', 'false');
});
