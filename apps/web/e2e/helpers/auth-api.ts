import type { APIRequestContext, Page } from '@playwright/test';
import { API_CONFIG, TEST_USERS, TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { waitForCapturedEmailLink } from './auth-email-link';
import type { RegisterAndLoginOptions } from './testHelpers';

export type { RegisterAndLoginOptions };

export function createSelfRegisterEmail(prefix = 'e2e-self-register'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
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
 * Sign in an existing account through the Web origin (Vite proxy) so the
 * Better Auth session cookie lands in this request context's cookie jar.
 * Signing in against the API origin directly would scope the cookie to the
 * wrong host and the web app would not see it.
 *
 * Works for both `page.request` and a standalone worker-level request context;
 * callers that need a page then use `loginViaApi` below.
 */
export async function signInViaApiRequest(
  request: APIRequestContext,
  options: { email: string; password?: string },
): Promise<void> {
  const password = options.password ?? TEST_USERS.MAIN.password;
  const res = await request.post(`${WEB_CONFIG.BASE_URL}/api/auth/sign-in/email`, {
    data: { email: options.email, password },
    timeout: TIMEOUT_CONFIG.AUTH_MUTATION,
  });
  if (!res.ok()) {
    throw new Error(`API sign-in failed with HTTP ${res.status()}: ${await res.text()}`);
  }
}

/**
 * Existing account sign-in plus page landing, for tests that hold a `Page`.
 */
export async function loginViaApi(
  page: Page,
  options: { email: string; password?: string; landingPath?: string },
): Promise<void> {
  await signInViaApiRequest(page.request, options);
  await navigateAfterApiAuth(page, options.landingPath);
}

/**
 * Create a verified account without touching the auth UI: API sign-up, consume
 * the verification link captured by the API's test-only mailbox endpoint, then
 * API sign-in. Registration/session/password contracts now live in
 * cloud-auth-http.integration.test.ts; WebAuthView stories cover the UI contract.
 */
export async function registerAccountViaApiRequest(
  request: APIRequestContext,
  options: { email: string; password?: string },
): Promise<void> {
  const email = options.email;
  const password = options.password ?? TEST_USERS.MAIN.password;

  const signUp = await request.post(`${API_CONFIG.AUTH_URL}/sign-up/email`, {
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
  const verification = await request.get(link, {
    maxRedirects: 0,
    timeout: TIMEOUT_CONFIG.API_REQUEST,
  });
  if (![200, 302, 303, 307, 308].includes(verification.status())) {
    throw new Error(`Email verification failed with HTTP ${verification.status()}`);
  }

  await signInViaApiRequest(request, { email, password });
}

/**
 * New account + landing page. Drop-in replacement for
 * testHelpers.registerAndLogin (same options); kept under the same name via the
 * alias export below so call sites only change their import source.
 */
export async function registerAndLoginViaApi(
  page: Page,
  options: RegisterAndLoginOptions = {},
): Promise<void> {
  const email = options.email ?? createSelfRegisterEmail();
  const password = options.password ?? TEST_USERS.MAIN.password;

  await registerAccountViaApiRequest(page.request, { email, password });
  await navigateAfterApiAuth(page, options.landingPath);
}

export { registerAndLoginViaApi as registerAndLogin };
