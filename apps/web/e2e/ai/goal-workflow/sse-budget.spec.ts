import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import {
  AIWorkflowRunViewSchema,
  AIGoalSurfaceLeaseRequestSchema,
  WorkspaceEventSchema,
  type AIWorkflowRunView,
  type GoalWorkflowLiveActionRecord,
} from '@memoflow/contracts/ai';
import { WEB_CONFIG } from '../../config';
import { createGoalLeaseDbMirror } from '../../helpers/goalLeaseDbMirror';
import {
  bootstrapGoalWorkflowSession,
  e2eConversationId,
  fulfillJson,
  generateTestEmail,
  sendComposerMessage,
} from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
  test('[P0] streams Goal fields without polling and keeps the failed draft available for native save', async ({
    page,
  }) => {
    const email = generateTestEmail();
    const responses = new Set<ServerResponse>();
    const runId = `workflow-sse-${randomUUID()}`;
    let view: Extract<AIWorkflowRunView, { kind: 'goal.create' }> = {
      kind: 'goal.create',
      runId,
      conversationId: e2eConversationId,
      status: 'running',
      resourceVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    let reads = 0;
    let head = 0;
    let journal: GoalWorkflowLiveActionRecord[] = [];
    let grant: { token: string; fence: number; expiresAt: number } | null = null;
    // Install the SSE fixture before login mounts the shared Workspace subscription.
    const origin = new URL(WEB_CONFIG.getFullUrl('/')).origin;
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Last-Event-ID');
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(
        `event: workspace\ndata: ${JSON.stringify({ type: 'stream.ready', cursor: `fixture:${head}` })}\n\n`,
      );
      responses.add(res);
      res.on('close', () => responses.delete(res));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const heartbeat = setInterval(() => {
      for (const response of responses) response.write(': heartbeat\n\n');
    }, 10_000);
    const publish = (next: Partial<typeof view>, actions: GoalWorkflowLiveActionRecord[] = []) => {
      const base = journal.length;
      journal = [...journal, ...actions];
      head += 1;
      const parsed = AIWorkflowRunViewSchema.parse({
        ...view,
        ...next,
        resourceVersion: (view.resourceVersion ?? 0) + 1,
        liveActions: journal,
        updatedAt: Date.now(),
      });
      if (parsed.kind !== 'goal.create') throw new Error('Invalid Goal fixture kind');
      view = parsed;
      const event = WorkspaceEventSchema.parse({
        type: 'workflow.updated',
        eventId: `${runId}:${view.resourceVersion}`,
        cursor: `fixture:${head}`,
        resourceVersion: view.resourceVersion,
        data: { ...view, liveActions: undefined },
        actions,
        baseActionSequence: base,
        lastActionSequence: journal.length,
      });
      for (const response of responses)
        response.write(`event: workspace\ndata: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await page.route('**/api/v1/ai/runtime/workspace/sse', (route) =>
        route.continue({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/events`,
        }),
      );
      const telemetry = await bootstrapGoalWorkflowSession(page, { email });
      const mirror = await createGoalLeaseDbMirror({ email });
      await page.route('**/api/v1/ai/runtime/workflow/start', async (route) => {
        const request = route.request().postDataJSON();
        view = { ...view, conversationId: request.conversationId };
        await fulfillJson(route, view);
      });
      await page.route('**/api/v1/ai/runtime/workflow/get', async (route) => {
        reads += 1;
        await fulfillJson(route, view);
      });
      await page.route('**/api/v1/ai/runtime/workflow/goal-surface-lease', async (route) => {
        const request = AIGoalSurfaceLeaseRequestSchema.parse(route.request().postDataJSON());
        expect(request.runId).toBe(runId);
        if (request.action === 'claim') {
          grant = {
            token: randomUUID(),
            fence: (grant?.fence ?? 0) + 1,
            expiresAt: Date.now() + 30_000,
          };
          await mirror.claim({ runId, ...grant });
          await fulfillJson(route, { status: 'claimed', ...grant });
        } else if (!grant || request.token !== grant.token || request.fence !== grant.fence) {
          await fulfillJson(route, { status: 'lost' });
        } else if (request.action === 'renew') {
          grant.expiresAt = Date.now() + 30_000;
          await mirror.renew({ runId, ...grant });
          await fulfillJson(route, { status: 'renewed', expiresAt: grant.expiresAt });
        } else {
          await mirror.release({ runId, token: grant.token, fence: grant.fence, now: Date.now() });
          await fulfillJson(route, { status: 'released' });
        }
      });
      await sendComposerMessage(
        page,
        'Create a structured AI workflow goal and preserve the draft if planning is interrupted.',
        'goal-workflow',
      );
      await expect.poll(() => reads).toBe(1);
      await expect.poll(() => responses.size).toBe(1);
      publish({}, [
        {
          sequence: 1,
          command: {
            actionId: 'name',
            revision: 1,
            operation: 'goal.setName',
            value: 'Preserved streamed draft',
          },
        },
        {
          sequence: 2,
          command: {
            actionId: 'description',
            revision: 1,
            operation: 'goal.patchDescription',
            value: 'Keep this description after the model stops.',
          },
        },
      ]);
      const form = page.getByTestId('goal-panel-form');
      await expect(form).toBeVisible();
      await expect(page.getByTestId('goal-name-input')).toHaveValue('Preserved streamed draft');
      await expect(page.getByTestId('goal-description-input')).toHaveValue(
        'Keep this description after the model stops.',
      );
      // A real open SSE connection stays healthy for the network-budget acceptance window.
      await page.waitForTimeout(30_000);
      expect(reads).toBe(1);
      publish({
        status: 'failed',
        failure: {
          code: 'RATE_LIMITED',
          message: 'Safe public failure',
          details: { limitKind: 'quota_exhausted' },
          retryHint: { kind: 'after', afterMs: 30_000 },
        },
      });
      const interruption = page.getByTestId('ai-workflow-interruption');
      await expect(interruption).toHaveCount(1);
      await expect(interruption).toContainText(/insufficient quota|配额不足/);
      await expect(interruption).toContainText('30');
      await expect(form).toBeVisible();
      await expect(page.getByTestId('goal-name-input')).toHaveValue('Preserved streamed draft');
      await page.screenshot({
        path: test.info().outputPath('goal-interruption-preserved.png'),
        fullPage: true,
      });
      await page.getByTestId('goal-name-input').fill('Manually saved preserved draft');
      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/goals' &&
          response.request().method() === 'POST',
      );
      await page.getByTestId('save-goal-button').click();
      expect((await saved).ok()).toBe(true);
      expect(telemetry.ownerGoalCreateCount).toBe(1);
      expect(telemetry.lastOwnerGoalCreateBody).not.toHaveProperty('nativeAiLease');
      expect(telemetry.lastOwnerGoalCreateBody?.name).toBe('Manually saved preserved draft');
      expect(telemetry.goalAgentApprovalResumeCount).toBe(0);
    } finally {
      clearInterval(heartbeat);
      for (const response of responses) response.end();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
