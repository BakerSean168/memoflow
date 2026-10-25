import { test, expect, type Locator } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';
import { dragBusinessPanel } from '../helpers/business-panel';

const generateTestEmail = () =>
  `e2e-notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Notification Center', () => {
  let testEmail: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail();

    await registerAndLogin(page, {
      email: testEmail,
      password: testPassword,
      landingPath: '/notifications',
    });

    await expect(page.getByTestId('notification-center')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  });

  test('[P0] should display a deterministic empty inbox for a new account', async ({ page }) => {
    await expect(page.getByTestId('notification-center')).toBeVisible();
    await expect(page.getByTestId('notification-filter-all')).toBeVisible();
    await expect(page.getByTestId('notifications-empty-state')).toBeVisible();
    await expect(page.getByTestId('notification-item')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="notification-item"][data-read-state="unread"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId('mark-all-read-button')).toBeDisabled();
    await page.getByTestId('notification-filter-unread').click();
    await expect(page.getByTestId('notification-center')).toBeVisible();
    await expect(page.getByTestId('notification-filter-unread')).toBeVisible();
    await expect(page.getByTestId('notification-filter-unread')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByTestId('notification-filter-all').click();
    await expect(page.getByTestId('notification-center')).toBeVisible();
    await expect(page.getByTestId('notification-filter-all')).toBeVisible();
  });

  test('[P0] keeps one inbox toolbar and filter state across panel layouts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const center = page.getByTestId('notification-center');
    const toolbar = page.getByTestId('notification-page-toolbar');
    const scrollHost = page.getByTestId('notification-scroll-host');
    const unreadFilter = page.getByTestId('notification-filter-unread');
    const markAllRead = page.getByTestId('mark-all-read-button');

    await expect(toolbar).toBeVisible();
    await unreadFilter.click();
    await expect(unreadFilter).toHaveAttribute('aria-selected', 'true');
    await markDomIdentity(toolbar, 'toolbar');
    await markDomIdentity(scrollHost, 'scroll');
    await markDomIdentity(markAllRead, 'mark-all');
    await scrollHost.evaluate((element) => {
      const filler = document.createElement('div');
      filler.style.height = '1200px';
      filler.dataset.layoutProbe = 'filler';
      element.appendChild(filler);
      element.scrollTop = 96;
    });

    await dragBusinessPanel(page, 'wider');
    await assertStableNotificationWorkspace({ toolbar, scrollHost, unreadFilter, markAllRead });

    await dragBusinessPanel(page, 'narrower');
    await assertStableNotificationWorkspace({ toolbar, scrollHost, unreadFilter, markAllRead });

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await assertStableNotificationWorkspace({ toolbar, scrollHost, unreadFilter, markAllRead });
    await expectElementToFit(toolbar);
    await expectElementToFit(center);
  });
});

async function markDomIdentity(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element, marker) => {
    element.setAttribute('data-instance-probe', marker);
  }, value);
}

async function assertStableNotificationWorkspace({
  toolbar,
  scrollHost,
  unreadFilter,
  markAllRead,
}: {
  toolbar: Locator;
  scrollHost: Locator;
  unreadFilter: Locator;
  markAllRead: Locator;
}): Promise<void> {
  await expect(toolbar).toHaveAttribute('data-instance-probe', 'toolbar');
  await expect(scrollHost).toHaveAttribute('data-instance-probe', 'scroll');
  await expect(markAllRead).toHaveAttribute('data-instance-probe', 'mark-all');
  await expect(unreadFilter).toHaveAttribute('aria-selected', 'true');
  expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(96);
}

async function expectElementToFit(locator: Locator): Promise<void> {
  const metrics = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}
