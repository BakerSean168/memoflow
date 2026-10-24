import type { Page } from '@playwright/test';
import { API_CONFIG, TEST_USERS, TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { waitForCapturedEmailLink } from './auth-email-link';
import type { RegisterAndLoginOptions } from './testHelpers';

export type { RegisterAndLoginOptions };

function createSelfRegisterEmail(): string {
  return `e2e-self-register-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function waitForAuthenticatedShell(page: Page): Promise<void> {
  await page.getByTestId('app-shell').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

// Same landing contract as testHelpers.navigateAfterAuth, except the API
// path starts from whatever page the caller holds (often about:blank), so
// with no landingPath we navigate to the app root explicitly instead of
// waiting on a page the UI login flow would have redirected away from.
async function navigateAfterApiAuth(page: Page, landingPath?: string): Promise<void> {
  const target = landingPath ? WEB_CONFIG.getFullUrl(landingPath) : `${WEB_CONFIG.BASE_URL}/`;
  if (page.url() !== target) {
    await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
  } else {
    await page.waitForLoadState('domcontentloaded');
  }
  await waitForAuthenticatedShell(page);
}

/**
 * Existing account: sign in through the web origin (Vite proxy) so the
 * Better Auth session cookie lands in this browser context's cookie jar.
 * Signing in against the API origin directly would scope the cookie to the
 * wrong host and the web app would not see it.
 */
export async function loginViaApi(
  page: Page,
  options: { email: string; password?: string; landingPath?: string },
): Promise<void> {
  const password = options.password ?? TEST_USERS.MAIN.password;
  const res = await page.request.post(`${WEB_CONFIG.BASE_URL}/api/auth/sign-in/email`, {
    data: { email: options.email, password },
    timeout: TIMEOUT_CONFIG.AUTH_MUTATION,
  });
  if (!res.ok()) {
    throw new Error(`API sign-in failed with HTTP ${res.status()}: ${await res.text()}`);
  }
  await navigateAfterApiAuth(page, options.landingPath);
}

/**
 * New account without touching the auth UI: API sign-up, consume the
 * verification link captured by the API's test-only mailbox endpoint, then
 * API sign-in. Drop-in replacement for testHelpers.registerAndLogin (same
 * options); kept under the same name via the alias export below so call
 * sites only change their import source. The UI registration flow itself
 * remains covered by e2e/authentication/*.
 */
export async function registerAndLoginViaApi(
  page: Page,
  options: RegisterAndLoginOptions = {},
): Promise<void> {
  const email = options.email ?? createSelfRegisterEmail();
  const password = options.password ?? TEST_USERS.MAIN.password;

  const signUp = await page.request.post(`${API_CONFIG.AUTH_URL}/sign-up/email`, {
    data: {
      email,
      password,
      name: email.split('@')[0],
      callbackURL: `${WEB_CONFIG.BASE_URL}/auth`,
    },
    timeout: TIMEOUT_CONFIG.AUTH_MUTATION,
  });
  if (!signUp.ok()) {
    throw new Error(`API sign-up failed with HTTP ${signUp.status()}: ${await signUp.text()}`);
  }

  const link = await waitForCapturedEmailLink(email, 'email-verification');
  const verification = await page.request.get(link, {
    maxRedirects: 0,
    timeout: TIMEOUT_CONFIG.API_REQUEST,
  });
  if (![200, 302, 303, 307, 308].includes(verification.status())) {
    throw new Error(`Email verification failed with HTTP ${verification.status()}`);
  }

  await loginViaApi(page, { email, password, landingPath: options.landingPath });
}

export { registerAndLoginViaApi as registerAndLogin };
