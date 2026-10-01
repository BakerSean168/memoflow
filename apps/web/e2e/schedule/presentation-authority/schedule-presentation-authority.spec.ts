import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const captureDir = path.resolve(
  import.meta.dirname,
  '../../../../../reports/test-system-v2/schedule-presentation-authority/captures',
);
mkdirSync(captureDir, { recursive: true });

const sourceIdentity = {
  schedule: {
    label: { 'en-US': 'Schedule', 'zh-CN': '日程' },
    sourceClass: 'planner-source-schedule',
    dotClass: 'bg-primary',
    badgeClass: 'bg-primary/10',
    colorToken: 'primary',
  },
  task: {
    label: { 'en-US': 'Task', 'zh-CN': '任务' },
    sourceClass: 'planner-source-task',
    dotClass: 'bg-info',
    badgeClass: 'bg-info/15',
    colorToken: 'info',
  },
  goal: {
    label: { 'en-US': 'Goal', 'zh-CN': '目标' },
    sourceClass: 'planner-source-goal',
    dotClass: 'bg-warning',
    badgeClass: 'bg-warning/15',
    colorToken: 'warning',
  },
  routine: {
    label: { 'en-US': 'Routine', 'zh-CN': '例程' },
    sourceClass: 'planner-source-routine',
    dotClass: 'bg-success',
    badgeClass: 'bg-success/15',
    colorToken: 'success',
  },
} as const;

const sourceIds = {
  schedule: 'entry-1',
  task: 'task-occurrence-1',
  goal: 'goal-1:target',
  routine: 'routine-1@2026-10-01T12:30',
} as const;

type Source = keyof typeof sourceIdentity;

function query(params: Record<string, string>) {
  return '/?' + new URLSearchParams(params).toString();
}

async function capture(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name + '.png', {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  await page.screenshot({
    path: path.join(captureDir, name + '.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fits).toBe(true);
}

async function installErrorCollector(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

for (const scenario of [
  { locale: 'en-US' as const, theme: 'light', width: 1280 },
  { locale: 'zh-CN' as const, theme: 'dark', width: 360 },
]) {
  test(
    scenario.locale +
      ' ' +
      scenario.theme +
      ' ' +
      scenario.width +
      ': source identity is stable across planner surfaces',
    async ({ page }) => {
      const errors = await installErrorCollector(page);
      await page.setViewportSize({ width: scenario.width, height: 900 });
      await page.clock.setFixedTime(new Date('2026-10-01T09:30:00Z'));

      for (const view of ['day', 'week', 'month'] as const) {
        await page.goto(
          query({
            surface: 'calendar',
            view,
            locale: scenario.locale,
            theme: scenario.theme,
          }),
        );
        await expect(page.getByTestId('schedule-fullcalendar')).toBeVisible();
        let eventRoot = page.getByTestId('schedule-fullcalendar');
        if (view === 'month') {
          const moreButton = page.getByRole('button', { name: /^\+\d+/ }).first();
          await expect(moreButton).toBeVisible();
          await moreButton.click();
          await expect(moreButton).toHaveAttribute('aria-expanded', 'true');
          eventRoot = page.getByRole('dialog');
          await expect(eventRoot).toBeVisible();
        }

        for (const source of Object.keys(sourceIdentity) as Source[]) {
          const event = eventRoot.getByTestId('schedule-event-' + source + '-' + sourceIds[source]);
          await expect(event).toBeVisible();
          await expect(event).toHaveClass(
            new RegExp('\\b' + sourceIdentity[source].sourceClass + '\\b'),
          );
          await expect(event).toHaveCSS(
            '--planner-event-hsl',
            await event.evaluate(
              (element, token) =>
                getComputedStyle(element)
                  .getPropertyValue('--' + token)
                  .trim(),
              sourceIdentity[source].colorToken,
            ),
          );
        }
        await capture(
          page,
          scenario.locale + '-' + scenario.theme + '-' + scenario.width + '-calendar-' + view,
        );
      }

      await page.goto(
        query({
          surface: 'day-detail',
          locale: scenario.locale,
          theme: scenario.theme,
        }),
      );
      await expect(
        page.getByTestId(scenario.width < 900 ? 'planner-day-sheet' : 'planner-day-dialog'),
      ).toBeVisible();
      await expect(page.getByTestId('planner-day-event-list')).toBeVisible();
      for (const source of Object.keys(sourceIdentity) as Source[]) {
        const event = page.getByTestId('schedule-event-' + source + '-' + sourceIds[source]);
        const dotClass = await event.locator('span.rounded-full').first().getAttribute('class');
        const badgeClass = await event
          .locator('span.inline-flex.rounded-full')
          .getAttribute('class');
        expect(dotClass).toContain(sourceIdentity[source].dotClass);
        expect(badgeClass).toContain(sourceIdentity[source].badgeClass);
        await expect(event).toContainText(sourceIdentity[source].label[scenario.locale]);
      }
      await capture(
        page,
        scenario.locale + '-' + scenario.theme + '-' + scenario.width + '-day-detail',
      );

      for (const source of Object.keys(sourceIdentity) as Source[]) {
        await page.goto(
          query({
            surface: 'event-detail',
            source,
            locale: scenario.locale,
            theme: scenario.theme,
          }),
        );
        const sheet = page.getByTestId(
          scenario.width < 900 ? 'planner-event-sheet' : 'planner-event-dialog',
        );
        await expect(sheet).toBeVisible();
        const dotClass = await sheet.locator('span.rounded-full').first().getAttribute('class');
        const badge = sheet
          .getByTestId('event-detail-properties')
          .locator('dd')
          .nth(1)
          .locator('span');
        expect(dotClass).toContain(sourceIdentity[source].dotClass);
        expect(await badge.getAttribute('class')).toContain(sourceIdentity[source].badgeClass);
        await expect(badge).toHaveText(sourceIdentity[source].label[scenario.locale]);
      }
      await capture(
        page,
        scenario.locale + '-' + scenario.theme + '-' + scenario.width + '-event-detail',
      );

      await page.goto(
        query({
          surface: 'capsule',
          locale: scenario.locale,
          theme: scenario.theme,
        }),
      );
      await page.waitForTimeout(100);
      expect(errors).toEqual([]);
      const capsule = page.getByTestId('schedule-capsule-preview');
      await expect(capsule).toBeVisible();
      await expect(
        capsule
          .getByTestId('schedule-capsule-primary')
          .getByText(sourceIdentity.schedule.label[scenario.locale], { exact: true }),
      ).toBeVisible();
      const upcoming = capsule.getByTestId('schedule-capsule-upcoming');
      for (const source of ['task', 'goal', 'routine'] as const) {
        await expect(
          upcoming.getByText(sourceIdentity[source].label[scenario.locale], { exact: true }),
        ).toBeVisible();
      }
      await capture(
        page,
        scenario.locale + '-' + scenario.theme + '-' + scenario.width + '-capsule',
      );

      expect(errors).toEqual([]);
    },
  );
}

for (const panelWidth of [1280, 600]) {
  test(`CalendarEntry CRUD with ${panelWidth}px panel in a wide viewport`, async ({ page }) => {
    const errors = await installErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-01T09:30:00Z'));
    await page.goto(
      query({ surface: 'crud', panelWidth: String(panelWidth), refreshFailure: '1' }),
    );
    const inspect = page.getByTestId(
      panelWidth < 900 ? 'planner-event-sheet' : 'planner-event-dialog',
    );
    const event = page.getByTestId('schedule-event-schedule-entry-1');
    await event.click();
    await expect(inspect).toBeVisible();
    await capture(page, `crud-${panelWidth}-inspect`);
    await page.getByTestId('planner-event-edit').click();
    const title = page.getByTestId('schedule-title-input');
    await expect(title).toHaveValue('Deep work / 深度工作');
    await title.fill('Edited calendar entry');
    await page.getByTestId('schedule-save-button').click();
    await expect(title).not.toBeVisible();
    await expect(page.getByText('Schedule updated', { exact: true })).toBeVisible();
    await expect(page.getByText(/updated.*refresh|saved.*refresh/i)).toBeVisible();
    await expect(event).toContainText('Edited calendar entry');
    await event.click();
    await page.getByTestId('planner-event-delete').click();
    await page.getByTestId('global-confirm-cancel').click();
    await expect(inspect).toBeVisible();
    await page.getByTestId('planner-event-delete').click();
    await expect(page.getByTestId('global-confirm-confirm')).toHaveClass(/bg-destructive/);
    await page.getByTestId('global-confirm-confirm').click();
    await expect(event).toHaveCount(0);
    await expect(page.getByText('Schedule deleted', { exact: true })).toBeVisible();
    await expect(page.getByText(/deleted.*refresh/i)).toBeVisible();
    const calls = await page.evaluate(() =>
      (window as unknown as { scheduleCrudEvidence(): unknown }).scheduleCrudEvidence(),
    );
    expect(calls).toEqual([
      expect.objectContaining({ command: 'update', id: 'entry-1', version: 1 }),
      { command: 'delete', id: 'entry-1', version: 2 },
    ]);
    await page.getByTestId('create-schedule-button').click();
    await page.getByTestId('schedule-title-input').fill('New calendar entry');
    await page.getByTestId('schedule-save-button').click();
    await expect(page.getByText('Schedule created', { exact: true })).toBeVisible();
    await expect(page.getByText(/created.*refresh/i)).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { scheduleCrudEvidence(): { command: string }[] })
            .scheduleCrudEvidence()
            .at(-1)?.command,
      ),
    ).toBe('create');
    expect(errors).toEqual([]);
  });
}

for (const kind of ['missing', 'stale']) {
  test(`CalendarEntry ${kind} inspect has deterministic feedback`, async ({ page }) => {
    const errors = await installErrorCollector(page);
    await page.clock.setFixedTime(new Date('2026-10-01T09:30:00Z'));
    await page.goto(query({ surface: 'crud' }));
    await page.getByTestId('schedule-event-schedule-entry-1').click();
    await page.evaluate(
      (kind) =>
        (
          window as unknown as { invalidateScheduleInspect(kind: string): void }
        ).invalidateScheduleInspect(kind),
      kind,
    );
    await page.getByTestId('planner-event-edit').click();
    await expect(page.getByText(/changed or is no longer available/)).toBeVisible();
    await expect(page.getByTestId('schedule-title-input')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        (window as unknown as { scheduleCrudEvidence(): unknown[] }).scheduleCrudEvidence(),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
