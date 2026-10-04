/**
 * Residual 1339: real GitHub OAuth provider path (NOT e2e-mock).
 *
 * Prerequisites:
 * - a real MemoFlow GitHub provider configuration (not e2e-mock)
 * - the provider callback must return to the same MemoFlow runtime that issued
 *   the OAuth state; the canonical GCP host-dev lane uses MemoFlow Dev Test
 * - run headed so a human can complete GitHub consent if needed:
 *   pnpm nx run web:e2e:oauth-real
 *
 * Explicitly does NOT close §13.2 via mock Authentication - GitHub OAuth (mock provider).
 */
import { expect, test, type Page } from '@playwright/test';
import { ensureLoginScene } from '../helpers/testHelpers';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { API_CONFIG } from '../config';

async function gotoCleanAuthPage(page: Page): Promise<void> {
  await page.goto(WEB_CONFIG.getFullUrl(WEB_CONFIG.LOGIN_PATH), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
  await ensureLoginScene(page);
}

test.describe('Authentication - GitHub OAuth (real provider)', () => {
  test('[P0] GitHub button opens github.com authorize; after consent Better Auth has a session', async ({
    page,
  }) => {
    await gotoCleanAuthPage(page);

    const githubButton = page.getByTestId('login-github-button');
    await expect(githubButton).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });

    const parentUrl = page.url();
    const [popup] = await Promise.all([page.waitForEvent('popup'), githubButton.click()]);
    await popup.waitForURL(
      (url) =>
        url.hostname === 'github.com' &&
        (url.pathname.includes('/login/oauth/authorize') || url.pathname.includes('/login')),
      { timeout: TIMEOUT_CONFIG.LOGIN },
    );

    // Prove the provider round-trip is isolated from the mounted product page.
    expect(popup.url()).toMatch(/github\.com/);
    expect(popup.url()).not.toContain('e2e-github-');
    expect(page.url()).toBe(parentUrl);

    // Semi-manual: human signs in + authorizes in the headed popup window.
    // The parent observes the shared same-origin session and only then leaves /auth.
    console.log(
      '[oauth-real] Waiting up to 10m for human GitHub sign-in + authorize. ' +
        'Complete login in the GitHub popup (app: MemoFlow Dev Test).',
    );
    await page.waitForURL((url) => !url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
      timeout: 10 * 60 * 1000,
    });
    await expect.poll(() => popup.isClosed(), { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT }).toBe(true);

    const sessionResponse = await page.request.get(`${API_CONFIG.AUTH_URL}/get-session`);
    expect(sessionResponse.ok()).toBe(true);
    const session = (await sessionResponse.json()) as {
      user?: { id?: string; email?: string };
      session?: { id?: string };
    };
    expect(session.user?.id).toBeTruthy();
    expect(session.user?.email).toBeTruthy();
    expect(session.session?.id).toBeTruthy();

    const persistedBearer = await page.evaluate(() =>
      Object.entries(localStorage).some(
        ([key, value]) => /token|session/i.test(key) || /bearer\s+/i.test(value),
      ),
    );
    expect(persistedBearer).toBe(false);
  });
});
