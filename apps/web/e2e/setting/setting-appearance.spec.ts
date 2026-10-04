import { expect, test, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const PASSWORD = 'Test123456!';

function createAppearanceAuditEmail(): string {
  return `e2e-settings-appearance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function openAppearanceSettings(page: Page): Promise<void> {
  await registerAndLogin(page, {
    email: createAppearanceAuditEmail(),
    password: PASSWORD,
    landingPath: '/settings?tab=appearance',
  });

  await expect(page).toHaveURL(/\/settings\?tab=appearance(?:&|$)/, {
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await expect(page.getByTestId('user-preference-settings-section')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await expect(page.getByTestId('appearance-settings-card')).toBeVisible();
  await expect(page.getByTestId('locale-settings-section')).toBeVisible();
}

async function selectTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname.endsWith('/api/v1/settings/preferences/presentation'),
    { timeout: TIMEOUT_CONFIG.AUTH_MUTATION },
  );

  await page.getByTestId('appearance-theme-trigger').click();
  await page.getByTestId(`appearance-theme-option-${theme}`).click();

  const response = await responsePromise;
  expect(response.ok()).toBe(true);
}

test.describe('Canonical appearance and locale settings', () => {
  test.beforeEach(async ({ page }) => {
    await openAppearanceSettings(page);
  });

  test('[P0] renders the owner-backed presentation and regional settings', async ({ page }) => {
    await expect(page.getByTestId('appearance-theme-trigger')).toBeVisible();
    await expect(page.locator('#language-select')).toBeVisible();
    await expect(page.locator('#timezone-select')).toBeVisible();
    await expect(page.getByTestId('settings-reset-button')).toBeVisible();
  });

  test('[P0] applies and persists the canonical theme preference', async ({ page }) => {
    await selectTheme(page, 'dark');

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('dark');
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('appearance-settings-card')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('dark');
  });

  test('[P1] applies and persists the canonical interface language', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith('/api/v1/settings/preferences/presentation'),
      { timeout: TIMEOUT_CONFIG.AUTH_MUTATION },
    );

    await page.locator('#language-select').click();
    await page.getByRole('option', { name: 'English' }).click();

    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      })
      .toMatch(/^en/i);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      })
      .toMatch(/^en/i);
  });

  test('[P1] rolls back an optimistic theme update when the canonical mutation fails', async ({
    page,
  }) => {
    const initialResolvedTheme = await page.evaluate(
      () => document.documentElement.dataset.theme ?? 'light',
    );
    const attemptedTheme = initialResolvedTheme === 'dark' ? 'light' : 'dark';

    await page.route('**/api/v1/settings/preferences/presentation', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'appearance audit failure' },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByTestId('appearance-theme-trigger').click();
    await page.getByTestId(`appearance-theme-option-${attemptedTheme}`).click();

    await expect(page.getByTestId('user-preference-mutation-error')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme), {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      })
      .toBe(initialResolvedTheme);
  });
});
