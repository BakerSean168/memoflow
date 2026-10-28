import { statSync } from 'node:fs';
import { expect, test } from '../helpers/fixtures';
import { AUTH_STATE_DIR } from '../helpers/worker-auth';
import { WEB_CONFIG } from '../config';

/**
 * Self-verification for the worker auth / per-test isolation fixture itself.
 *
 * These tests are the reproducible record for the behaviours ordinary specs
 * rely on: worker-scoped session preparation, one independent BrowserContext
 * per test, expired-session repair, and data cleanup that also runs when a test
 * does not finish cleanly.
 */

const seededGoalIds: string[] = [];

async function readGoal(
  request: { get: (url: string, options?: object) => Promise<{ status: () => number; ok: () => boolean; json: () => Promise<unknown> }> },
  goalId: string,
): Promise<{ name?: string; deletedAt?: unknown } | null> {
  const response = await request.get(`/api/v1/goals/${goalId}`, { failOnStatusCode: false });
  if (!response.ok()) return null;
  const body = (await response.json()) as { data?: { name?: string; deletedAt?: unknown } };
  return body.data ?? null;
}

test.describe('worker auth fixture', () => {
  test.afterAll(async ({ playwright, workerAccount }) => {
    // Teardown-cleanup evidence: goals seeded by tests in this file must be
    // gone because fixture teardown deletes them, whatever the test order was.
    const request = await playwright.request.newContext({
      baseURL: WEB_CONFIG.BASE_URL,
      storageState: workerAccount.statePath,
    });
    try {
      for (const goalId of seededGoalIds) {
        const goal = await readGoal(request, goalId);
        expect(goal, `goal ${goalId} should still be readable after teardown`).not.toBeNull();
        expect(goal?.deletedAt, `goal ${goalId} should be deleted by fixture teardown`).not.toBeNull();
      }
    } finally {
      await request.dispose();
    }
  });

  test('[P1] prepares one authenticated worker session outside Git-tracked source', async ({
    authSession,
    workerAccount,
  }) => {
    expect(workerAccount.statePath.startsWith(AUTH_STATE_DIR)).toBe(true);
    expect(workerAccount.statePath).toContain('/test-results/');
    expect(statSync(workerAccount.statePath).mode & 0o777).toBe(0o600);
    expect(authSession.identity.email).toBe(workerAccount.email);
    expect(authSession.identity.email).toContain(`e2e-worker-${workerAccount.workerIndex}`);
  });

  test('[P1] keeps the authenticated worker email on the server session', async ({
    authSession,
    request,
  }) => {
    const response = await request.get('/api/auth/get-session');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { user?: { email?: string } } | null;
    expect(body?.user?.email).toBe(authSession.identity.email);
  });

  test('[P1] gives every test an isolated BrowserContext from the worker state', async ({
    browser,
    context,
    authSession,
  }) => {
    expect(browser.contexts()).toHaveLength(1);
    expect(browser.contexts()[0]).toBe(context);

    const second = await browser.newContext();
    try {
      expect(second).not.toBe(context);
      // Both start from the worker storageState, but cookie jars are separate:
      // dropping the second context's session must not affect this test.
      expect((await second.cookies()).map((cookie) => cookie.name)).toContain(
        'better-auth.session_token',
      );
      await second.clearCookies();
      expect(await second.cookies()).toEqual([]);

      const owned = await context.request.get('/api/auth/get-session');
      const body = (await owned.json()) as { user?: { email?: string } };
      expect(body.user?.email).toBe(authSession.identity.email);
    } finally {
      await second.close();
    }
  });

  test('[P1] isolates seeded business records by test key and deletes them on demand', async ({
    testData,
  }) => {
    const goal = await testData.seedGoal({ name: 'Isolation goal' });
    seededGoalIds.push(goal.id);

    expect(testData.key).toMatch(/^e2e-[0-9a-f]{8}$/);
    const created = await testData.readGoal(goal.id);
    expect(created?.name).toBe(testData.name('Isolation goal'));
    expect(created?.name).toContain(testData.key);

    await testData.cleanupNow();
    expect(testData.cleanupCount).toBeGreaterThanOrEqual(1);
    expect(testData.cleanupFailures).toEqual([]);
    const deleted = await testData.readGoal(goal.id);
    expect(deleted?.deletedAt).toEqual(expect.anything());
  });

  test('[P2] repairs an expired session through the API exactly once', async ({ authSession }) => {
    await authSession.expire();
    expect(await authSession.hasServerSession()).toBe(false);

    expect(await authSession.ensureValid()).toBe('refreshed');
    expect(authSession.refreshCount).toBe(1);
    expect(await authSession.hasServerSession()).toBe(true);

    // A second probe must not trigger another sign-in.
    expect(await authSession.ensureValid()).toBe('valid');
    expect(authSession.refreshCount).toBe(1);
  });

  test('[P2] repairs the session automatically after an API 401', async ({ authSession, page }) => {
    await authSession.expire();
    expect(await authSession.hasServerSession()).toBe(false);

    // A public page gives the renderer a real origin; the application request
    // still fails with 401 and the fixture must re-authenticate once and
    // rewrite the worker state file so later tests stay authenticated.
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    const status = await page.evaluate(async (origin) => {
      const response = await fetch(`${origin}/api/v1/goals`, { credentials: 'include' });
      return response.status;
    }, WEB_CONFIG.BASE_URL);
    expect(status).toBe(401);

    await expect.poll(async () => authSession.refreshCount, { timeout: 15_000 }).toBe(1);
    expect(authSession.expiredResponses).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => authSession.hasServerSession(), { timeout: 15_000 }).toBe(true);
  });
});
