import { expect, test, type Page, type Route } from '@playwright/test';
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
          'ai:conversation-workflow-map',
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
    await expect(page.getByTestId('ai-chat-tool-menu-trigger')).toBeEnabled();
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
    await expect(page.getByTestId('goal-agent-confirm-run')).toBeVisible();
    await expect(page.getByTestId('goal-agent-cancel-run')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await testInfo.attach('phase-e-configured-workflow-1440x900', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('[P1] defers workflow switching for a dirty form and preserves its draft', async ({
    page,
  }, testInfo) => {
    const suffix = testSuffix();
    const draftTitle = `[PM-E] 脏表单草稿 ${suffix}`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    collectBrowserErrors(page, consoleErrors, pageErrors);

    await registerAndLogin(page, {
      email: `pm-phase-e-dirty-${suffix}@test.com`,
      password,
      landingPath: '/goals',
    });
    await installConfiguredModelMock(page);
    await seedChinesePresentation(page);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('ai-chat-empty-models')).toHaveCount(0);
    await page.getByTestId('create-goal-entry').click();
    await page.getByTestId('goal-name-input').fill(draftTitle);

    await selectGoalWorkflowTool(page, true);

    const workflowTab = page.getByTestId('business-panel-workflow');
    await expect(workflowTab).toBeVisible();
    await expect(workflowTab).not.toHaveAttribute('aria-current', 'page');
    await expect(workflowTab).toContainText('1');
    await expect(page.getByTestId('goal-dialog')).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draftTitle);

    await workflowTab.dispatchEvent('click');
    await expect(workflowTab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('shell-workflow-surface')).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draftTitle);

    await page.locator('button[aria-label="关闭工作流"]').dispatchEvent('click');
    await expect(page.getByTestId('goal-dialog')).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draftTitle);

    await testInfo.attach('phase-e-dirty-workflow-1280x720', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.getByTestId('goal-dialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('[P1] keeps a user-hidden panel closed until explicit mobile interaction', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const suffix = testSuffix();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    collectBrowserErrors(page, consoleErrors, pageErrors);

    await registerAndLogin(page, {
      email: `pm-phase-e-mobile-${suffix}@test.com`,
      password,
      landingPath: '/',
    });
    await installConfiguredModelMock(page);
    await seedChinesePresentation(page);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const shell = page.getByTestId('app-shell');
    const panel = page.getByTestId('business-panel');
    const panelToggle = page.getByTestId('shell-right-panel-toggle');

    await expect(shell).toHaveAttribute('data-shell-state', 'focus');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('today-overview-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'chat');
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('shell-ai-column')).toBeVisible();
    await expect(page.getByTestId('ai-chat-tool-menu-trigger')).toBeEnabled();

    await selectGoalWorkflowTool(page);

    await expect(panel).toBeHidden();
    await expect(panelToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('shell-workflow-attention-badge')).toHaveText('1');
    await expectNoHorizontalOverflow(page);

    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'focus');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('business-panel-workflow')).toContainText('1');
    await page.getByTestId('business-panel-workflow').click();
    await expect(page.getByTestId('business-panel-workflow')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('shell-workflow-surface')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await testInfo.attach('phase-e-mobile-workflow-390x844', {
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
          providerType: 'openai_compatible',
          baseUrl: 'https://api.openai.com/v1',
          apiKeyMasked: 'sk-****phase-e',
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

async function selectGoalWorkflowTool(page: Page, directDispatch = false): Promise<void> {
  const trigger = page.getByTestId('ai-chat-tool-menu-trigger');
  await expect(trigger).toBeEnabled();
  if (directDispatch) await trigger.dispatchEvent('click');
  else await trigger.click();

  const goalTool = page.getByTestId('ai-chat-tool-goal-create');
  await expect(goalTool).toBeVisible();
  if (directDispatch) await goalTool.dispatchEvent('click');
  else await goalTool.click();
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

async function installApprovalRestoreMocks(
  page: Page,
  fixture: ApprovalFixture,
): Promise<void> {
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
  const draft = {
    revision: 1,
    goal: {
      name: 'Phase E 待审批目标',
      description: '验证 clean shell 自动恢复 canonical Mastra goal.create workflow。',
      motivation: '验证 runtime-owned durable workflow refresh restore。',
      feasibilityAnalysis: '用户确认后由产品 application port 执行业务写入。',
      startDate: now,
      dueDate: now + 7 * 24 * 60 * 60 * 1000,
    },
    keyResults: [
      {
        title: '完成 Phase E workflow 审批',
        description: '从 durable run 恢复并显示待确认草稿。',
        calculationMethod: 'Sum',
        startingValue: 0,
        progressBaselineValue: null,
        currentValue: 0,
        targetValue: 1,
        unit: 'workflow',
        weight: 3,
      },
    ],
    taskPlans: [],
    reminders: [],
    rationale: 'Phase E validates the canonical Mastra workflow surface.',
    warnings: [],
  };
  const runView = {
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
    workflowEntry: {
      mode: 'goal-create',
      goalWorkflowStage: 'confirm',
      goalWorkflowRun: runView,
      taskWorkflowRun: null,
      knowledgeCaptureRun: null,
      knowledgeAnswer: null,
      clarificationAnswers: [],
      editableGoal: {
        name: '',
        description: '',
        category: '',
        importance: 'Moderate',
        motivation: '',
        feasibilityAnalysis: '',
        tags: [],
        startDate: null,
        targetDate: null,
      },
      editableKeyResults: [],
      editableTaskPlans: [],
      editableReminders: [],
      showGoalDraftEditor: false,
    },
  };
}

async function fulfillJson(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });
}
