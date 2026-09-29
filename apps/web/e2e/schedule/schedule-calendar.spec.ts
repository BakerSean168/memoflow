import { expect, test, type Locator } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';
import { dragBusinessPanel } from '../helpers/business-panel';

const testPassword = 'Test123456!';

test.describe('Schedule calendar workspace', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, {
      email: `e2e-schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      password: testPassword,
      landingPath: '/schedule/calendar',
    });

    await expect(page.getByTestId('schedule-calendar-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });

  test('[P0] keeps week view, period, DOM, and scroll across panel layouts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const root = page.getByTestId('schedule-calendar-view');
    const toolbar = page.getByTestId('schedule-page-toolbar');
    const content = page.getByTestId('schedule-calendar-content');
    const plannerCalendar = page.getByTestId('schedule-fullcalendar');
    const weekTab = page.getByTestId('schedule-view-tab-week');
    const periodLabel = page.getByTestId('schedule-period-label');
    const primaryCreate = page.locator('[data-primary-action="create-schedule"]:visible');

    await expect(plannerCalendar).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(weekTab).toHaveAttribute('aria-selected', 'true');
    await expect(primaryCreate).toHaveCount(1);
    await markDomIdentity(toolbar, 'toolbar');
    await markDomIdentity(content, 'content');
    await markDomIdentity(plannerCalendar, 'planner');
    const periodText = await periodLabel.innerText();
    const scrollTop = await markCalendarScrollPosition(plannerCalendar);
    expect(scrollTop).toBeGreaterThan(0);

    await dragBusinessPanel(page, 'wider');
    await assertStableSchedule({
      toolbar,
      content,
      plannerCalendar,
      weekTab,
      periodLabel,
      periodText,
      scrollTop,
      primaryCreate,
    });

    await dragBusinessPanel(page, 'narrower');
    await assertStableSchedule({
      toolbar,
      content,
      plannerCalendar,
      weekTab,
      periodLabel,
      periodText,
      scrollTop,
      primaryCreate,
    });

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await assertStableSchedule({
      toolbar,
      content,
      plannerCalendar,
      weekTab,
      periodLabel,
      periodText,
      scrollTop,
      primaryCreate,
    });
    await expectElementToFit(toolbar);
    await expectElementToFit(root);
  });

  test('[P0] switches every calendar view and navigates its period from one toolbar', async ({
    page,
  }) => {
    const periodLabel = page.getByTestId('schedule-period-label');

    await page.getByTestId('schedule-view-tab-month').click();
    await expect(page.getByTestId('schedule-view-tab-month')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const plannerCalendar = page.getByTestId('schedule-fullcalendar');
    await markDomIdentity(plannerCalendar, 'planner');
    await expect(plannerCalendar).toBeVisible();
    await expect(plannerCalendar).toHaveAttribute('data-instance-probe', 'planner');
    const initialMonth = await periodLabel.innerText();
    await page.getByTestId('schedule-next-period').click();
    await expect(periodLabel).not.toHaveText(initialMonth);

    await page.getByTestId('schedule-view-tab-day').click();
    await expect(plannerCalendar).toBeVisible();
    await expect(plannerCalendar).toHaveAttribute('data-instance-probe', 'planner');
    await expect(page.getByTestId('schedule-view-tab-day')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('[P0] selects blank time without crashing the panel on FullCalendar mirror events', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const plannerCalendar = page.getByTestId('schedule-fullcalendar');
    await expect(plannerCalendar).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    const dayColumn = plannerCalendar.locator('.planner-day-lane').first();
    const startSlot = plannerCalendar.locator('.planner-slot-lane[data-time="08:00:00"]');
    const endSlot = plannerCalendar.locator('.planner-slot-lane[data-time="09:00:00"]');
    await expect(dayColumn).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(startSlot).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(endSlot).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    const day = await dayColumn.boundingBox();
    const start = await startSlot.boundingBox();
    const end = await endSlot.boundingBox();
    expect(day).not.toBeNull();
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();

    // FullCalendar selection must begin inside a dated time-grid column. The slot-lane
    // row is only the vertical time geometry; using its own X coordinate can hit the
    // axis/mirror layer instead of a selectable day cell.
    const x = day!.x + day!.width / 2;
    await page.mouse.move(x, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, end!.y + end!.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByTestId('panel-error-fallback')).toBeHidden();
    await expect(page.getByTestId('schedule-dialog')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    expect(pageErrors.some((message) => message.includes("reading 'sourceType'"))).toBe(false);
  });

  test('[P0] creates a schedule from the only primary action', async ({ page }) => {
    const title = `E2E Schedule ${Date.now()}`;

    await page.getByTestId('create-schedule-button').click();
    const dialog = page.getByTestId('schedule-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('schedule-title-input').fill(title);
    await dialog.getByTestId('schedule-save-button').click();

    await expect(dialog).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });
});

async function markDomIdentity(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element, marker) => {
    element.setAttribute('data-instance-probe', marker);
  }, value);
}

async function assertStableSchedule({
  toolbar,
  content,
  plannerCalendar,
  weekTab,
  periodLabel,
  periodText,
  scrollTop,
  primaryCreate,
}: {
  toolbar: Locator;
  content: Locator;
  plannerCalendar: Locator;
  weekTab: Locator;
  periodLabel: Locator;
  periodText: string;
  scrollTop: number;
  primaryCreate: Locator;
}): Promise<void> {
  await expect(primaryCreate).toHaveCount(1);
  await expect(toolbar).toHaveAttribute('data-instance-probe', 'toolbar');
  await expect(content).toHaveAttribute('data-instance-probe', 'content');
  await expect(plannerCalendar).toHaveAttribute('data-instance-probe', 'planner');
  await expect(weekTab).toHaveAttribute('aria-selected', 'true');
  await expect(periodLabel).toHaveText(periodText);
  expect(await readCalendarScrollPosition(plannerCalendar)).toBe(scrollTop);
}

async function markCalendarScrollPosition(plannerCalendar: Locator): Promise<number> {
  return plannerCalendar.evaluate((root) => {
    const scrollHost = Array.from(root.querySelectorAll<HTMLElement>('*')).find((element) => {
      const style = getComputedStyle(element);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight + 1
      );
    });
    if (!scrollHost) throw new Error('Planner calendar has no vertical scroll owner');
    scrollHost.setAttribute('data-scroll-probe', 'planner-calendar');
    scrollHost.scrollTop = Math.min(96, scrollHost.scrollHeight - scrollHost.clientHeight);
    return scrollHost.scrollTop;
  });
}

async function readCalendarScrollPosition(plannerCalendar: Locator): Promise<number> {
  return plannerCalendar.evaluate((root) => {
    const scrollHost = root.querySelector<HTMLElement>('[data-scroll-probe="planner-calendar"]');
    if (!scrollHost) throw new Error('Planner calendar scroll owner was remounted');
    return scrollHost.scrollTop;
  });
}

async function expectElementToFit(locator: Locator): Promise<void> {
  const metrics = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}
