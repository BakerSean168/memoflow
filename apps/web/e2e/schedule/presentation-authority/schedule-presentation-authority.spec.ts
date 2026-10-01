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
      await expect(page.getByTestId('schedule-day-event-list')).toBeVisible();
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
        const sheet = page.getByTestId('event-detail-sheet');
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
