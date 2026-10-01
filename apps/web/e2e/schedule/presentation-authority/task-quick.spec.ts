import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// Fixture-based production-component acceptance; service doubles, no live backend.
const captureDir = path.resolve(
  import.meta.dirname,
  '../../../../../reports/test-system-v2/schedule-presentation-authority/captures',
);
mkdirSync(captureDir, { recursive: true });
for (const panelWidth of [1280, 600]) {
  test(`Task canonical actions in Schedule ${panelWidth}px panel`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-01T09:30:00Z'));
    await page.goto(`/?surface=task-quick&panelWidth=${panelWidth}`);
    const event = page.getByTestId('schedule-event-task-task-occurrence-1');
    await event.click();
    const inspect = page.getByTestId(
      panelWidth < 900 ? 'planner-event-sheet' : 'planner-event-dialog',
    );
    await expect(inspect).toBeVisible();
    const row = page.getByTestId('task-compact-occurrence-task-occurrence-1');
    const complete = page.getByTestId('task-compact-complete-task-occurrence-1');
    await expect(row).toHaveAttribute('data-task-status', 'Pending');
    await page.getByTestId('task-compact-checklist-toggle-task-occurrence-1').click();
    await page.getByTestId('task-compact-checklist-item-step').click();
    await expect(page.getByTestId('task-compact-checklist-item-step')).toHaveAttribute(
      'data-state',
      'checked',
    );
    await complete.click();
    await expect(row).toHaveAttribute('data-task-status', 'Completed');
    await complete.click();
    await expect(row).toHaveAttribute('data-task-status', 'Pending');
    await row.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Skip' }).click();
    await expect(row).toHaveAttribute('data-task-status', 'Skipped');
    // Canonical correction parity: terminal Missed/Skipped can be completed.
    await complete.click();
    await expect(row).toHaveAttribute('data-task-status', 'Completed');
    await complete.click();
    await row.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Mark missed' }).click();
    await expect(row).toHaveAttribute('data-task-status', 'Missed');
    await expect(page).toHaveScreenshot(`task-quick-${panelWidth}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });
    await page.screenshot({
      path: path.join(captureDir, `task-quick-${panelWidth}.png`),
      fullPage: true,
    });
    const calls = await page.evaluate(() =>
      (
        window as unknown as { scheduleCrudEvidence(): { command: string }[] }
      ).scheduleCrudEvidence(),
    );
    expect(calls[0]).toEqual({
      command: 'checklist',
      id: 'task-occurrence-1',
      request: { definitionId: 'step', completed: true, expectedVersion: 1 },
    });
    expect(calls.map((call) => call.command)).toEqual([
      'checklist',
      'complete',
      'uncomplete',
      'skip',
      'complete',
      'uncomplete',
      'missed',
    ]);
    await row.getByRole('button', { name: 'Review task / 复盘任务', exact: true }).click();
    await expect(page.getByTestId('task-plan-sentinel')).toBeVisible();
    expect(errors).toEqual([]);
  });
  test(`Task Prompt measurement in Schedule ${panelWidth}px panel`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-01T09:30:00Z'));
    await page.goto(`/?surface=task-quick&panelWidth=${panelWidth}&prompt=1`);
    await page.getByTestId('schedule-event-task-task-occurrence-1').click();
    await page.getByTestId('task-compact-complete-task-occurrence-1').click();
    await expect(page.getByTestId('task-completion-measurement-dialog')).toBeVisible();
    await page.locator('#change-amount').fill('3');
    await page.locator('#record-note').fill('Schedule measurement');
    await expect(page).toHaveScreenshot(`task-prompt-${panelWidth}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });
    await page.screenshot({
      path: path.join(captureDir, `task-prompt-${panelWidth}.png`),
      fullPage: true,
    });
    await page.getByTestId('task-record-and-complete').click();
    await expect(page.getByTestId('task-completion-measurement-dialog')).toHaveCount(0);
    await expect(page.getByTestId('task-compact-occurrence-task-occurrence-1')).toHaveAttribute(
      'data-task-status',
      'Completed',
    );
    const calls = await page.evaluate(() =>
      (window as unknown as { scheduleCrudEvidence(): unknown[] }).scheduleCrudEvidence(),
    );
    expect(calls).toEqual([
      {
        command: 'complete',
        id: 'task-occurrence-1',
        request: { goalMeasurement: { value: 3, note: 'Schedule measurement' } },
      },
    ]);
    expect(errors).toEqual([]);
  });
}
