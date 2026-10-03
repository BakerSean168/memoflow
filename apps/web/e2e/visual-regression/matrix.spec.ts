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
