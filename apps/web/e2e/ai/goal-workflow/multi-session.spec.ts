import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import { login, registerAndLogin } from '../../helpers/testHelpers';
import { e2ePassword, generateTestEmail } from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
  test('[P0] converges Conversation create, rename and deletion across two authenticated browser sessions', async ({
    page,
    browser,
  }) => {
    const email = generateTestEmail();
    await registerAndLogin(page, { email, password: e2ePassword });
    const secondContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const peer = await secondContext.newPage();
    try {
      await login(peer, email, e2ePassword);
      const sessions = [page, peer];
      // Every list GET is accounted for: a request aborted by the reload below
      // settles through `requestfailed`, never `requestfinished`.
      const metrics = sessions.map(() => ({ lists: 0, completed: 0, failed: [] as string[] }));
      const isConversationList = (request: Request) =>
        request.method() === 'GET' &&
        new URL(request.url()).pathname === '/api/v1/ai/chat/conversations';
      for (const [index, session] of sessions.entries()) {
        session.on('request', (request) => {
          if (isConversationList(request)) metrics[index]!.lists += 1;
        });
        session.on('requestfinished', (request) => {
          if (isConversationList(request)) metrics[index]!.completed += 1;
        });
        session.on('requestfailed', (request) => {
          if (isConversationList(request))
            metrics[index]!.failed.push(request.failure()?.errorText ?? 'unknown');
        });
      }
      // Both Vue projections must establish their own authenticated SSE before the mutation.
      const ready = sessions.map((session) =>
        session.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === '/api/v1/ai/runtime/workspace/sse' &&
            response.status() === 200,
          { timeout: TIMEOUT_CONFIG.NAVIGATION },
        ),
      );
      await Promise.all(
        sessions.map((session) => session.reload({ waitUntil: 'domcontentloaded' })),
      );
      await Promise.all(ready);
      for (const session of sessions) {
        await expect(session.getByTestId('app-shell')).toBeVisible();
        // Fresh identities have no providers. This state appears only after
        // registry, provider and workspace discovery initialization finishes.
        await expect(session.getByTestId('ai-composer-provider-unavailable')).toBeVisible({
          timeout: TIMEOUT_CONFIG.NAVIGATION,
        });
      }
      const sidebar = (session: Page) => session.locator('[data-sidebar-presentation="docked"]');
      // App readiness signal: the Conversation projection applied a snapshot
      // started after its live stream watermark (useConversationProjection).
      for (const session of sessions) {
        await expect(sidebar(session)).toHaveAttribute('data-conversation-projection', 'live', {
          timeout: TIMEOUT_CONFIG.NAVIGATION,
        });
      }
      await expect.poll(() => metrics.every((entry) => entry.completed >= 1)).toBe(true);
      const row = (session: Page, title: string) =>
        sidebar(session).getByRole('button', {
          name: title,
          exact: true,
        });
      // Use the same proxy origin as the app so its authenticated cookie is
      // included even when localhost and 127.0.0.1 differ in the test profile.
      const endpoint = `${new URL(page.url()).origin}/api/v1/ai/chat/conversations`;
      // Prove both projections crossed their live/snapshot boundary before
      // measuring deltas. Initialization may legitimately coalesce list reads.
      const barrierTitle = `Ready barrier ${randomUUID()}`;
      const barrierResponse = await page.request.post(endpoint, { data: { name: barrierTitle } });
      expect(barrierResponse.status()).toBe(201);
      const barrier = z
        .object({ data: z.object({ id: z.string().min(1) }) })
        .parse(await barrierResponse.json());
      for (const session of sessions) {
        await expect(row(session, barrierTitle)).toBeVisible({
          timeout: TIMEOUT_CONFIG.NAVIGATION,
        });
      }
      // Events are applied in order per projection, so the barrier delta is only
      // visible after any calibration snapshot finished; both projections are
      // still live, so no further list read may be started from here on.
      for (const session of sessions) {
        await expect(sidebar(session)).toHaveAttribute('data-conversation-projection', 'live');
      }
      const listCounts = metrics.map((entry) => entry.lists);
      const failedCounts = metrics.map((entry) => entry.failed.length);
      const firstTitle = `Two-session Conversation ${randomUUID()}`;
      const created = await page.request.post(endpoint, { data: { name: firstTitle } });
      expect(created.status()).toBe(201);
      const creation = z
        .object({ data: z.object({ id: z.string().min(1) }) })
        .parse(await created.json());
      for (const session of sessions) {
        await expect(row(session, firstTitle)).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
      }
      const nextTitle = `Updated Conversation ${randomUUID()}`;
      const renamed = await page.request.patch(`${endpoint}/${creation.data.id}`, {
        data: { name: nextTitle },
      });
      expect(renamed.status()).toBe(200);
      for (const session of sessions) {
        await expect(row(session, nextTitle)).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
        await expect(row(session, firstTitle)).toHaveCount(0);
      }
      const deleted = await page.request.delete(`${endpoint}/${creation.data.id}`);
      expect(deleted.status()).toBe(200);
      for (const session of sessions) {
        await expect(row(session, nextTitle)).toHaveCount(0, {
          timeout: TIMEOUT_CONFIG.NAVIGATION,
        });
      }
      // No business list refetch is required for any of the three committed deltas.
      expect(metrics.map((entry) => entry.lists)).toEqual(listCounts);
      // ...and no list request failed while the deltas were applied.
      expect(metrics.map((entry) => entry.failed.length)).toEqual(failedCounts);
      expect((await page.request.delete(`${endpoint}/${barrier.data.id}`)).status()).toBe(200);
    } finally {
      await secondContext.close();
    }
  });
});
