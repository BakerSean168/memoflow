import { expect, test, type APIResponse } from '@playwright/test';
import { API_CONFIG, TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

test.use({ timezoneId: 'Asia/Shanghai' });

test.describe('Planner owner-command acceptance', () => {
  test('[P0][Fixture J] Task 14:00 -> 16:00 owner conflict reverts the optimistic FullCalendar drag', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const taskName = `Fixture J planner task ${suffix}`;

    await registerAndLogin(page, {
      email: `fixture-j-${suffix}@test.com`,
      password,
      landingPath: '/tasks',
    });

    const taskDate = await page.evaluate(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });

    const creation = await expectApiData<{
      template: { id: string };
      todayInstanceCreated: boolean;
    }>(
      await page.request.post(`${API_CONFIG.API_PREFIX}/task-plans`, {
        data: {
          name: taskName,
          description: 'HARD-7103 Fixture J owner-command rollback',
          schedule: {
            kind: 'OneTime',
            date: taskDate,
            timing: { kind: 'At', time: '14:00' },
          },
          reminderConfig: null,
          importance: 'Moderate',
          labelIds: [],
          goalBinding: null,
        },
      }),
    );
    expect(creation.todayInstanceCreated).toBe(true);

    await page.goto('/schedule/calendar', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('schedule-calendar-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('schedule-view-tab-week')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const event = page.locator('[data-testid^="schedule-event-task-"]').filter({
      hasText: taskName,
    });
    await expect(event).toHaveCount(1, { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    const targetTimeLabel = page.getByText(/^(16:00|16时)$/, { exact: true }).last();
    await expect(targetTimeLabel).toHaveCount(1, { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await targetTimeLabel.scrollIntoViewIfNeeded();
    await expect(event).toBeVisible();
    const before = await event.boundingBox();
    expect(before).not.toBeNull();

    let reschedulePayload: unknown = null;
    await page.route('**/api/v1/task-occurrences/*/reschedule', async (route) => {
      reschedulePayload = route.request().postDataJSON();
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { code: 'CONFLICT', message: 'Fixture J forced owner conflict' },
        }),
      });
    });

    const target = await targetTimeLabel.boundingBox();
    expect(target).not.toBeNull();

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        /\/api\/v1\/task-occurrences\/[^/]+\/reschedule$/.test(new URL(request.url()).pathname),
    );

    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2, target!.y + target!.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await requestPromise;

    await expect.poll(() => reschedulePayload, { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT }).toMatchObject({
      newTime: { timeType: 'TimePoint', timePoint: 16 * 60 },
    });

    await expect
      .poll(
        async () => {
          const box = await event.boundingBox();
          return box == null || before == null ? null : Math.round(box.y - before.y);
        },
        { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
      )
      .toBe(0);
    await expect(event).toContainText(taskName);
  });
});

async function expectApiData<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as { ok?: boolean; data?: T; error?: unknown };
  expect(response.ok(), JSON.stringify(body.error ?? body)).toBe(true);
  expect(body.ok, JSON.stringify(body)).not.toBe(false);
  expect(body.data, JSON.stringify(body)).toBeDefined();
  return body.data as T;
}
