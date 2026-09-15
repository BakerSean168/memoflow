import { test, expect, type Locator, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const generateTestEmail = () =>
  `e2e-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Notification Settings', () => {
  let testEmail: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail();
    await registerAndLogin(page, {
      email: testEmail,
      password: testPassword,
      landingPath: '/settings',
    });
    await openNotificationsSettings(page);
  });

  test('should display owner-backed notification delivery settings', async ({ page }) => {
    await expect(page.getByTestId('notification-delivery-card')).toBeVisible();
    await expect(page.getByTestId('notification-global-inApp')).toBeVisible();
  });

  test('should update NotificationPreference instead of legacy UserSetting', async ({ page }) => {
    const notificationToggle = page.getByTestId('notification-global-inApp');
    const initialState = await notificationToggle.getAttribute('aria-checked');
    const updatedState = initialState === 'true' ? 'false' : 'true';

    await toggleNotificationPreference(page, notificationToggle);
    await expect(notificationToggle).toHaveAttribute('aria-checked', updatedState, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });

  test('should keep notification delivery settings available after reload', async ({ page }) => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await openNotificationsSettings(page);
    await expect(page.getByTestId('notification-delivery-card')).toBeVisible();
    await expect(page.getByTestId('notification-global-inApp')).toBeVisible();
  });
});

async function openNotificationsSettings(page: Page) {
  await page.getByTestId('settings-tab-notifications').click();
  await expect(page.getByTestId('notification-delivery-card')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

async function toggleNotificationPreference(page: Page, locator: Locator) {
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/notifications/preferences') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  );
  await locator.click();
  await updateResponse;
}
