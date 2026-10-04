import { expect, type Page } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

export const ACCOUNT_TEST_PASSWORD = 'Test123456!';

export function createAccountAuditEmail(prefix = 'e2e-account'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

export async function openAccountSettings(
  page: Page,
  options: { email?: string; password?: string } = {},
): Promise<{ email: string; password: string }> {
  const email = options.email ?? createAccountAuditEmail();
  const password = options.password ?? ACCOUNT_TEST_PASSWORD;

  await registerAndLogin(page, {
    email,
    password,
    landingPath: '/settings?tab=account',
  });

  await expect(page).toHaveURL(/\/settings\?tab=account(?:&|$)/);
  await expect(page.getByTestId('user-settings-view')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await expect(page.getByTestId('account-settings-section')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await expect(page.getByTestId('account-center-view')).toBeVisible();
  await expect(page.getByTestId('account-profile-nickname')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });

  return { email, password };
}

export async function confirmGlobalDialog(page: Page): Promise<void> {
  await expect(page.getByTestId('global-confirm-dialog')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await page.getByTestId('global-confirm-confirm').click();
}
