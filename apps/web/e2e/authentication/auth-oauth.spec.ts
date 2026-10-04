import { expect, test, type Page } from '@playwright/test';
import { ensureLoginScene } from '../helpers/testHelpers';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';

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

test.describe('Authentication - GitHub OAuth provider entry', () => {
  test('[P0] GitHub button opens the configured provider authorize URL without navigating the parent', async ({
    page,
  }) => {
    await gotoCleanAuthPage(page);

    const githubButton = page.getByTestId('login-github-button');
    await expect(githubButton).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    const parentUrl = page.url();
    await page.context().route('https://github.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<main>GitHub OAuth gate</main>',
      }),
    );

    const [popup] = await Promise.all([page.waitForEvent('popup'), githubButton.click()]);
    await popup.waitForURL((url) => url.hostname === 'github.com', {
      timeout: TIMEOUT_CONFIG.LOGIN,
    });

    const authorizeUrl = new URL(popup.url());
    expect(authorizeUrl.pathname).toBe('/login/oauth/authorize');
    expect(authorizeUrl.searchParams.get('client_id')).toBe('e2e-mock');
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
    expect(page.url()).toBe(parentUrl);

    await popup.close();
    await expect(githubButton).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  });
});
