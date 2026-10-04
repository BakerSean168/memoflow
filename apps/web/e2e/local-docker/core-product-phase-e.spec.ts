import { expect, test, type Page, type Route } from '@playwright/test';
import type { AIWorkflowRunView, GoalPlanDraft } from '@memoflow/contracts/ai';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';
const providerId = 'provider-pm-phase-e';
const modelId = 'gpt-4.1-mini';

test.describe('Local Docker core product Phase E', () => {
  test('[P1] auto-opens a configured-model approval workflow on a clean 1440x900 shell', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const suffix = testSuffix();
    const conversationId = `pm-phase-e-conversation-${suffix}`;
    const runId = `pm-phase-e-run-${suffix}`;
    const approval = createApprovalFixture({ conversationId, runId });
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    collectBrowserErrors(page, consoleErrors, pageErrors);

    await registerAndLogin(page, {
      email: `pm-phase-e-approval-${suffix}@test.com`,
      password,
      landingPath: '/',
    });
    await installConfiguredModelMock(page);
    await installApprovalRestoreMocks(page, approval);
    await seedChinesePresentation(page);
    await page.evaluate(
      ({ seededConversationId, seededWorkflow }) => {
        localStorage.setItem('ai:last-conversation-id', seededConversationId);
        localStorage.setItem(
          'ai:conversation-model-map',
          JSON.stringify({
            [seededConversationId]: 'provider-pm-phase-e::gpt-4.1-mini',
          }),
        );
        localStorage.setItem(
          'ai:conversation-workflow-map:v3',
          JSON.stringify({ [seededConversationId]: seededWorkflow }),
        );
        localStorage.removeItem('ai:last-model-key');
        localStorage.removeItem('ai:debug:legacy-goal-workflow');
      },
      {
        seededConversationId: conversationId,
        seededWorkflow: approval.workflowEntry,
      },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'split');
    await expect(page.getByTestId('ai-chat-empty-models')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-add-context')).toBeEnabled();
    await expect(page.getByTestId('shell-ai-column')).toBeVisible();
    await expect(page.getByTestId('business-panel')).toBeVisible();
    await expect(page.getByTestId('business-panel-workflow')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('shell-workflow-surface')).toBeVisible();

    const approvalPanel = page.getByTestId('goal-workflow-panel');
    await expect(approvalPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(approvalPanel).toContainText('Phase E 待审批目标');
    await expect(approvalPanel).toContainText(/suspended/i);
    await expect(page.getByTestId('goal-open-native-review')).toBeVisible();
    await expect(page.getByTestId('goal-agent-confirm-run')).toHaveCount(0);
    await expect(page.getByTestId('goal-agent-cancel-run')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await testInfo.attach('phase-e-configured-workflow-1440x900', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

function testSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function collectBrowserErrors(page: Page, consoleErrors: string[], pageErrors: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
}

async function seedChinesePresentation(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem(
      'presentation-preference',
      JSON.stringify({ locale: 'zh-CN', theme: 'auto' }),
    );
  });
}

async function installConfiguredModelMock(page: Page): Promise<void> {
  await page.route('**/api/v1/ai/providers', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await fulfillJson(route, {
      data: [
        {
          id: providerId,
          identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
          name: 'Phase E OpenAI',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          credentialRef: 'credential-phase-e',
          defaultModel: modelId,
          availableModels: [{ id: modelId, name: modelId }],
          isActive: true,
          isDefault: true,
          priority: 1,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        },
      ],
    });
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
}

type ApprovalFixture = ReturnType<typeof createApprovalFixture>;

async function installApprovalRestoreMocks(page: Page, fixture: ApprovalFixture): Promise<void> {
  const { conversationId, runView } = fixture;
  const conversation = {
    id: conversationId,
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
    name: 'Phase E Approval Session',
    status: 'Active',
    messageCount: 1,
    lastMessageAt: Date.now(),
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    messages: null,
  };

  await page.route('**/api/v1/ai/chat/conversations?*', async (route) => {
    await fulfillJson(route, { data: [conversation], total: 1, page: 1, pageSize: 24 });
  });
  await page.route(`**/api/v1/ai/chat/conversations/${conversationId}`, async (route) => {
    await fulfillJson(route, conversation);
  });
  await page.route('**/api/v1/ai/runtime/assistant/history', async (route) => {
    await fulfillJson(route, { conversationId, messages: [] });
  });
  await page.route('**/api/v1/ai/runtime/usage', async (route) => {
    await fulfillJson(route, { executionCount: 0 });
  });
  await page.route('**/api/v1/ai/runtime/workflow/get', async (route) => {
    await fulfillJson(route, runView);
  });
}

function createApprovalFixture(input: { conversationId: string; runId: string }) {
  const now = Date.now();
  const draft: GoalPlanDraft = {
    revision: 1,
    goal: {
      draftRef: 'goal',
      name: 'Phase E 待审批目标',
      summary: '验证 clean shell 自动恢复 canonical Mastra goal.create workflow。',
      status: 'Planned',
      startDate: '2026-09-19',
      target: { kind: 'day', date: '2026-09-26' },
      labels: [],
    },
    keyResults: [
      {
        draftRef: 'kr:phase-e-approval',
        title: '完成 Phase E workflow 审批',
        description: '从 durable run 恢复并显示待确认草稿。',
        aggregationMethod: 'Sum',
        initialValue: 0,
        currentValue: 0,
        targetValue: 1,
        target: null,
        unit: 'workflow',
        weight: 3,
      },
    ],
    tasks: [],
    knowledge: [],
    rationale: 'Phase E validates the canonical Mastra workflow surface.',
    warnings: [],
  };
  const runView: AIWorkflowRunView = {
    runId: input.runId,
    conversationId: input.conversationId,
    kind: 'goal.create',
    status: 'suspended',
    suspension: {
      type: 'goal_draft_review',
      draft,
      warnings: draft.warnings,
      revision: draft.revision,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    conversationId: input.conversationId,
    runId: input.runId,
    runView,
    workflowEntry: { activeRunId: input.runId },
  };
}

async function fulfillJson(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });
}
