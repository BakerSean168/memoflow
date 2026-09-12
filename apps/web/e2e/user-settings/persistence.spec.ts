import { test, expect, type Locator, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const generateTestEmail = () =>
  `e2e-persistence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const testPassword = 'Test123456!';

test.describe('Settings owner persistence', () => {
  let testEmail: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail();
    await registerAndLogin(page, {
      email: testEmail,
      password: testPassword,
      landingPath: '/settings',
    });
  });

  test('[P1] should persist canonical presentation theme after page reload', async ({ page }) => {
    await openAppearanceSettings(page);
    await selectTheme(page, 'dark');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await openAppearanceSettings(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('[P1] should persist NotificationPreference delivery choice after page reload', async ({ page }) => {
    await openNotificationsSettings(page);

    const notificationToggle = page.getByTestId('notification-global-inApp');
    const initialState = await notificationToggle.getAttribute('aria-checked');
    const updatedState = initialState === 'true' ? 'false' : 'true';

    await toggleNotificationPreference(page, notificationToggle);
    await expect(notificationToggle).toHaveAttribute('aria-checked', updatedState, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await openNotificationsSettings(page);
    await expect(page.getByTestId('notification-global-inApp')).toHaveAttribute(
      'aria-checked',
      updatedState,
    );
  });

  test('[P2] should expose the same NotificationPreference across tabs', async ({ page, context }) => {
    await openNotificationsSettings(page);

    const notificationToggle = page.getByTestId('notification-global-inApp');
    const initialState = await notificationToggle.getAttribute('aria-checked');
    const updatedState = initialState === 'true' ? 'false' : 'true';

    await toggleNotificationPreference(page, notificationToggle);
    await expect(notificationToggle).toHaveAttribute('aria-checked', updatedState, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    const page2 = await context.newPage();
    await page2.goto('/settings', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await openNotificationsSettings(page2);
    await expect(page2.getByTestId('notification-global-inApp')).toHaveAttribute(
      'aria-checked',
      updatedState,
    );
    await page2.close();
  });
});

async function openAppearanceSettings(page: Page) {
  await page.getByTestId('settings-tab-appearance').click();
  await expect(page.getByTestId('appearance-settings-card')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

async function openNotificationsSettings(page: Page) {
  await page.getByTestId('settings-tab-notifications').click();
  await expect(page.getByTestId('notification-delivery-card')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

async function selectTheme(page: Page, theme: 'light' | 'dark' | 'auto') {
  const trigger = themeTrigger(page);
  const option = page.getByTestId(`appearance-theme-option-${theme}`);
  await expect(trigger).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await expect(trigger).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await trigger.click();
  await expect(option).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

  const patchResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/settings/preferences/presentation') &&
      response.request().method() === 'PATCH' &&
      response.ok(),
  );
  await option.click();
  await patchResponse;
}

function themeTrigger(page: Page): Locator {
  return page.getByTestId('appearance-theme-trigger');
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
