import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Production Calendar/View/dialog and owner composables; deterministic service doubles only.
const captureDir = path.resolve(
  import.meta.dirname,
  '../../../../../reports/test-system-v2/schedule-presentation-authority/captures',
);
mkdirSync(captureDir, { recursive: true });
type Evidence = {
  calls: { command: string; version?: number; request?: unknown }[];
  scheduleReads: number;
  entries: { id: string; version: number; range: { start: number; end: number } }[];
};
const evidence = (page: Page): Promise<Evidence> =>
  page.evaluate(() =>
    (window as unknown as { scheduleCollisionEvidence(): Evidence }).scheduleCollisionEvidence(),
  );
async function capture(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name + '.png', {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixels: 0,
  });
  await page.screenshot({
    path: path.join(captureDir, name + '.png'),
    fullPage: true,
    animations: 'disabled',
  });
}
async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-01T09:30:00Z'));
  await page.goto('/?surface=collision&' + query);
  await expect(page.getByTestId('schedule-event-schedule-entry-1')).toBeVisible();
  await expect.poll(async () => (await evidence(page)).scheduleReads).toBe(1);
  return errors;
}
async function drag(page: Page, source: 'schedule' | 'task', from: string, to: string) {
  const event = page.getByTestId(
    source === 'schedule'
      ? 'schedule-event-schedule-entry-1'
      : 'schedule-event-task-task-occurrence-1',
  );
  const target = page.locator(`.planner-slot-lane[data-time="${to}:00"]`);
  await target.scrollIntoViewIfNeeded();
  const before = (await event.boundingBox())!;
  const origin = (await page.locator(`.planner-slot-lane[data-time="${from}:00"]`).boundingBox())!;
  const destination = (await target.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2 + destination.y - origin.y,
    { steps: 12 },
  );
  await page.mouse.up();
  return { event, before };
}

test('Task drag target-day conflict reverts with one owner call', async ({ page }) => {
  const errors = await open(page);
  const { event, before } = await drag(page, 'task', '10:30', '11:30');
  await expect
    .poll(async () => (await evidence(page)).calls)
    .toEqual([
      {
        command: 'reschedule',
        id: 'task-occurrence-1',
        request: {
          expectedVersion: 1,
          scheduleSnapshot: { date: '2026-10-01', timing: { kind: 'At', time: '11:30' } },
        },
      },
    ]);
  await expect.poll(async () => Math.round((await event.boundingBox())!.y - before.y)).toBe(0);
  await expect(page.locator('[data-sonner-toast]')).toContainText('already has an occurrence');
  expect((await evidence(page)).scheduleReads).toBe(1);
  await capture(page, 'collision-task-revert');
  expect(errors).toEqual([]);
});

test('CalendarEntry drag applies once with exact version and survives view remount', async ({
  page,
}) => {
  const errors = await open(page);
  const { event, before } = await drag(page, 'schedule', '09:00', '11:00');
  const range = {
    kind: 'Timed',
    start: Date.parse('2026-10-01T11:00:00Z'),
    end: Date.parse('2026-10-01T12:00:00Z'),
  };
  await expect
    .poll(async () => (await evidence(page)).calls)
    .toEqual([
      { command: 'update', id: 'entry-1', version: 1, request: { expectedVersion: 1, range } },
    ]);
  await expect.poll(async () => (await event.boundingBox())!.y > before.y).toBe(true);
  await page.getByTestId('schedule-view-tab-day').click();
  await page.getByTestId('schedule-view-tab-week').click();
  await expect(event).toHaveCount(1);
  await expect(event).toContainText('Deep work');
  expect((await evidence(page)).entries[0]).toMatchObject({ version: 2, range });
  expect((await evidence(page)).calls).toHaveLength(1);
  await capture(page, 'collision-entry-success');
  expect(errors).toEqual([]);
});

for (const conflict of ['stale', 'conflict'] as const) {
  test(`CalendarEntry ${conflict} reverts and refreshes only stale canonical facts`, async ({
    page,
  }) => {
    const errors = await open(page, 'collision=' + conflict);
    const { event, before } = await drag(page, 'schedule', '09:00', '11:00');
    await expect.poll(async () => (await evidence(page)).calls.length).toBe(1);
    await expect.poll(async () => Math.round((await event.boundingBox())!.y - before.y)).toBe(0);
    await expect(page.locator('[data-sonner-toast]')).toContainText(
      conflict === 'stale' ? 'updated elsewhere' : 'conflicts',
    );
    await expect
      .poll(async () => (await evidence(page)).scheduleReads)
      .toBe(conflict === 'stale' ? 2 : 1);
    await capture(page, 'collision-entry-' + conflict);
    if (conflict === 'stale') {
      // A distinct later gesture uses the refreshed version, never an automatic stale-write retry.
      await drag(page, 'schedule', '09:00', '11:00');
      await expect.poll(async () => (await evidence(page)).calls.length).toBe(2);
      expect((await evidence(page)).calls[1]?.version).toBe(2);
      expect((await evidence(page)).entries[0]?.version).toBe(3);
    }
    // The production Schedule error handler logs this expected owner rejection.
    expect(errors).toEqual(['This request conflicts with existing data. Please try again.']);
  });
}

test('empty-cell create submits once during duplicate form events and keeps committed card after refresh failure', async ({
  page,
}) => {
  const errors = await open(page, 'holdCreate=1&refreshFailure=1');
  const lane = page.locator('.planner-slot-lane[data-time="13:00:00"]');
  const entry = (await page.getByTestId('schedule-event-schedule-entry-1').boundingBox())!;
  const box = (await lane.boundingBox())!;
  await page.mouse.click(entry.x + entry.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('schedule-title-input')).toHaveCount(1);
  await page.getByTestId('schedule-title-input').fill('Collision-safe create');
  await capture(page, 'collision-create-dialog');
  await page.locator('#schedule-form').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => (await evidence(page)).calls.length).toBe(1);
  await expect(page.getByTestId('schedule-save-button')).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as { finishScheduleWrite(): void }).finishScheduleWrite(),
  );
  await expect(page.getByTestId('schedule-title-input')).toHaveCount(0);
  await expect(page.getByTestId('schedule-event-schedule-entry-created')).toHaveCount(1);
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Schedule created' }),
  ).toHaveCount(2);
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'could not refresh' }),
  ).toHaveCount(1);
  const state = await evidence(page);
  expect(state.calls).toEqual([
    {
      command: 'create',
      request: {
        name: 'Collision-safe create',
        range: {
          kind: 'Timed',
          start: Date.parse('2026-10-01T13:00:00Z'),
          end: Date.parse('2026-10-01T13:30:00Z'),
        },
        autoDetectConflicts: true,
      },
    },
  ]);
  expect(state.entries).toHaveLength(2);
  await capture(page, 'collision-created-card');
  expect(errors).toEqual([]);
});
