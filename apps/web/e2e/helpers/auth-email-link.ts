import type { Page } from '@playwright/test';
import { API_CONFIG, TIMEOUT_CONFIG, WEB_CONFIG } from '../config';

export type CapturedEmailKind = 'email-verification' | 'password-reset';

export async function waitForCapturedEmailLink(
  email: string,
  kind: CapturedEmailKind,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_CONFIG.API_REQUEST * 3;
  const intervalMs = options?.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  const url = new URL(`${API_CONFIG.AUTH_URL}/test/last-email-link`);
  url.searchParams.set('email', email);
  url.searchParams.set('kind', kind);

  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = (await response.json()) as { data?: { url?: string } };
        if (typeof body.data?.url === 'string') return body.data.url;
      } else if (response.status !== 404) {
        lastError = new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for ${kind} link for ${email}: ${
      lastError instanceof Error ? lastError.message : String(lastError ?? 'no link')
    }`,
  );
}

export async function completeEmailVerification(
  page: Page,
  email: string,
  password?: string,
): Promise<void> {
  const link = await waitForCapturedEmailLink(email, 'email-verification');

  // Verification is an API transaction. Do not make its success depend on the
  // callback Web bundle finishing a cold Vite navigation within NAVIGATION.
  // Better Auth redirects to /auth after consuming the token; keep that
  // redirect outside this request and enter the Web surface explicitly below.
  const verification = await page.request.get(link, {
    maxRedirects: 0,
    timeout: TIMEOUT_CONFIG.API_REQUEST,
  });
  if (![200, 302, 303, 307, 308].includes(verification.status())) {
    throw new Error(`Email verification failed with HTTP ${verification.status()}`);
  }

  if (!password) return;

  await page.goto(WEB_CONFIG.getFullUrl(WEB_CONFIG.LOGIN_PATH), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.AUTH_BOOTSTRAP,
  });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL((url) => !url.pathname.includes('/auth'), {
    timeout: TIMEOUT_CONFIG.LOGIN,
  });
}
