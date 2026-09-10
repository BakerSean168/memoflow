import { expect, test, type Page, type Route } from '@playwright/test';
import type { AIWorkflowRunView, GoalPlanDraft } from '@memoflow/contracts/ai';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const generateTestEmail = () =>
  `e2e-ai-goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
const e2eConversationId = 'conv-e2e-goal-1';
const e2ePassword = 'Test123456!';

type GoalWorkflowSessionOptions = {
  email?: string;
  conversationId?: string | null;
  modelKey?: string | null;
  workflowEntry?: Record<string, unknown> | null;
  seedConversation?: boolean;
  landingPath?: string;
  expectAiVisible?: boolean;
};

/**
 * Seed only AI workspace local state after a real authenticated session exists.
 * Do not plant fake access/refresh tokens — auth must come from registerAndLogin.
 */
async function seedAiLocalState(
  page: Page,
  options: {
    conversationId?: string | null;
    modelKey?: string | null;
    workflowEntry?: Record<string, unknown> | null;
  } = {},
): Promise<void> {
  const conversationId = options.conversationId ?? null;
  const modelKey = options.modelKey ?? null;
  const workflowEntry = options.workflowEntry ?? null;

  await page.evaluate(
    ({
      lastConversationStorageKey,
      conversationWorkflowStorageKey,
      lastModelStorageKey,
      conversationModelStorageKey,
      legacyGoalWorkflowStorageKey,
      seededConversationId,
      seededModelKey,
      seededWorkflowEntry,
    }) => {
      window.localStorage.removeItem(lastModelStorageKey);
      // Residual 211: legacy goal-workflow debug dual-track is retired; clear any stale key.
      window.localStorage.removeItem(legacyGoalWorkflowStorageKey);

      if (seededConversationId) {
        window.localStorage.setItem(lastConversationStorageKey, seededConversationId);
        if (seededModelKey) {
          window.localStorage.setItem(
            conversationModelStorageKey,
            JSON.stringify({ [seededConversationId]: seededModelKey }),
          );
        } else {
          window.localStorage.removeItem(conversationModelStorageKey);
        }

        if (seededWorkflowEntry) {
          window.localStorage.setItem(
            conversationWorkflowStorageKey,
            JSON.stringify({ [seededConversationId]: seededWorkflowEntry }),
          );
        } else {
          window.localStorage.removeItem(conversationWorkflowStorageKey);
        }
      } else {
        window.localStorage.removeItem(lastConversationStorageKey);
        window.localStorage.removeItem(conversationWorkflowStorageKey);
        window.localStorage.removeItem(conversationModelStorageKey);
      }
    },
    {
      lastConversationStorageKey: 'ai:last-conversation-id',
      conversationWorkflowStorageKey: 'ai:conversation-workflow-map',
      lastModelStorageKey: 'ai:last-model-key',
      conversationModelStorageKey: 'ai:conversation-model-map',
      legacyGoalWorkflowStorageKey: 'ai:debug:legacy-goal-workflow',
      seededConversationId: conversationId,
      seededModelKey: modelKey,
      seededWorkflowEntry: workflowEntry,
    },
  );
}

/**
 * Real JWT via register/login, then AI route mocks, then optional AI local state, then navigate.
 * Mocks are installed after auth so register/login/settings are not blocked incorrectly.
 */

/**
 * Residual 1333: Vue-controlled composer uses :value + @input.
 * Wait for model readiness, drive input via fill+input event, and assert SSE completes
 * so hasWorkflowUserMessages/chatLoading unlock Start Agent / knowledge actions.
 */
async function sendComposerMessage(page: Page, message: string): Promise<void> {
  const composer = page.getByTestId('ai-chat-composer');
  await expect(composer).toBeEnabled({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  // Model select populated → canSendMessage can become true once text is non-empty.
  await expect(page.getByTestId('ai-chat-empty-models')).toHaveCount(0, {
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });

  await composer.click();
  await composer.fill(message);
  await expect(composer).toHaveValue(message);

  const sendButton = page.getByTestId('ai-chat-send-message');
  await expect(sendButton).toBeEnabled({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });

  const sseResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/ai/runtime/assistant/sse') &&
      response.request().method() === 'POST' &&
      response.status() === 200,
    { timeout: TIMEOUT_CONFIG.NAVIGATION },
  );
  await sendButton.click();
  await sseResponse;

  // Composer clears after a successful Mastra open-chat turn starts.
  await expect(composer).toHaveValue('', {
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  // Stop button disappears once chatLoading clears (stream closed + finally).
  await expect(page.getByTestId('ai-chat-stop-generating')).toHaveCount(0, {
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

async function bootstrapGoalWorkflowSession(
  page: Page,
  options: GoalWorkflowSessionOptions = {},
): Promise<GoalWorkflowMockTelemetry> {
  const email = options.email ?? generateTestEmail();
  const landingPath = options.landingPath ?? '/';

  await registerAndLogin(page, {
    email,
    password: e2ePassword,
  });

  const telemetry = await installGoalWorkflowMocks(page, {
    seedConversation: options.seedConversation,
  });

  await seedAiLocalState(page, {
    conversationId: options.conversationId,
    modelKey: options.modelKey,
    workflowEntry: options.workflowEntry,
  });

  await page.goto(WEB_CONFIG.getFullUrl(landingPath), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });

  // Cold Vite main-app graph often exceeds ELEMENT_WAIT (10s); wait for shell mount
  // before tests assert AI controls (see residual goal-workflow splash flake).
  // Residual 1335: app-shell replaces #startup-splash first; ai-chat-view is nested.
  await page.getByTestId('app-shell').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('ai-chat-view').waitFor({
    state: options.expectAiVisible === false ? 'attached' : 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });

  return telemetry;
}

test.describe('AI Goal Workflow', () => {
  test('[P0] loads the AI Agent Workspace from the root route', async ({ page }) => {
    await bootstrapGoalWorkflowSession(page);

    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('ai-chat-composer')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page).toHaveURL(/\/$/);
  });

  test('[P0] keeps the AI Agent Workspace usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapGoalWorkflowSession(page, { expectAiVisible: false });

    const shell = page.getByTestId('app-shell');
    const panelToggle = page.getByTestId('shell-right-panel-toggle');
    await expect(shell).toHaveAttribute('data-shell-state', 'focus');
    await expect(page.getByTestId('business-panel')).toBeVisible();
    await expect(page.getByTestId('ai-chat-view')).toBeHidden();

    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'chat');
    await expect(page.getByTestId('business-panel')).toBeHidden();

    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('ai-chat-composer')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > window.innerWidth + 1 ||
        document.body.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-knowledge-qa').click();

    await sendComposerMessage(page, 'How should knowledge answers stay grounded in citations?');

    await expect(page.getByTestId('knowledge-qa-ask')).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
  });

  test('[P0] restores a pending Goal Agent approval run after refresh', async ({ page }) => {
    await bootstrapGoalWorkflowSession(page, {
      conversationId: e2eConversationId,
      modelKey: 'provider-e2e-openai::gpt-4.1-mini',
      workflowEntry: createPendingApprovalWorkflowEntry(),
      seedConversation: true,
    });

    // ADR-052: the durable Mastra Workflow panel (AIWorkflowRunView) owns this
    // surface — not a legacy goal-agent-panel AgentRun / Host Proposal.
    const workflowPanel = page.getByTestId('goal-workflow-panel');
    await expect(workflowPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(page.getByTestId('goal-agent-confirm-run')).toBeVisible();
    await expect(page.getByTestId('goal-agent-cancel-run')).toBeVisible();
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    // Full main-app remount after reload needs NAVIGATION budget (same as bootstrap).
    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    await expect(workflowPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(page.getByTestId('goal-agent-confirm-run')).toBeVisible();
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);
  });

  test('[P0] completes Goal Agent confirmation through the controlled executor and retries failed actions', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-goal-create').click();

    await sendComposerMessage(
      page,
      'Create a structured AI workflow goal through the Agent runtime and execute the approved plan.',
    );

    const startButton = page.getByTestId('goal-agent-start-run');
    await expect(startButton).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await startButton.click();

    // ADR-052: goal.create renders in the durable Workflow panel, not a
    // legacy goal-agent-panel.
    const workflowPanel = page.getByTestId('goal-workflow-panel');
    await expect(workflowPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Agent-created AI workflow/i);
    await expect(workflowPanel).toContainText(/Run the Goal Agent workflow end to end/i);
    // Task template / reminder names render only inside the optional draft
    // editor; the review card shows the goal, key result, and rationale.
    await expect(workflowPanel).toContainText(
      /Create the approved goal draft with a measurable key result/i,
    );
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    await page.getByTestId('goal-agent-confirm-run').click();

    // Controlled executor: the first approved execution is partial, so the
    // durable runtime suspends with a recovery_required suspension.
    await expect(page.getByTestId('goal-workflow-recovery')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-workflow-recovery')).toContainText(/KEY_RESULT_FAILED/i);
    await expect(page.getByTestId('goal-workflow-recovery')).toContainText(
      /Workflow execution failed/i,
    );
    expect(telemetry.goalAgentStartCount).toBe(1);
    expect(telemetry.lastGoalAgentStart?.idea ?? '').toMatch(/Agent runtime/i);
    expect(telemetry.lastGoalAgentStart?.providerId).toBe('provider-e2e-openai');
    expect(telemetry.lastGoalAgentStart?.model).toBe('gpt-4.1-mini');
    expect(telemetry.goalAgentApprovalResumeCount).toBe(1);
    expect(telemetry.goalAgentExecuteRequestCount).toBe(1);

    const retryButton = page.getByTestId('goal-agent-retry-execution');
    await expect(retryButton).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await retryButton.click();

    // The durable runtime completes after the retry; the retry control is
    // removed and the ready product deep-links to the created goal. Assert the
    // completion outcome instead of racing the transient result panel against
    // the deep-link navigation.
    await expect(retryButton).toHaveCount(0, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-workflow-result'))
      .toContainText(/goal-e2e-1/i, {
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      })
      .catch(() => undefined);
    await expect(page).toHaveURL(/\/goals\/goal-e2e-1/, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    expect(telemetry.goalAgentRetryResumeCount).toBe(1);
    expect(telemetry.goalAgentExecuteRequestCount).toBe(2);
    expect(telemetry.goalAgentCompletionResumeCount).toBe(1);
  });

  test('[P0] restores a pending task.create approval run after refresh', async ({ page }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page, {
      conversationId: e2eConversationId,
      modelKey: 'provider-e2e-openai::gpt-4.1-mini',
      workflowEntry: createPendingTaskApprovalWorkflowEntry(),
      seedConversation: true,
    });

    const workflowPanel = page.getByTestId('task-workflow-panel');
    await expect(workflowPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(workflowPanel).toContainText(/Restored Mastra task workflow/i);
    await expect(page.getByTestId('task-agent-confirm-run')).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(workflowPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(workflowPanel).toContainText(/Restored Mastra task workflow/i);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] completes task.create through the canonical Mastra Workflow panel', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-task-create').click();
    await sendComposerMessage(page, 'Create a weekly task to review the Mastra-only AI migration.');

    const startButton = page.getByTestId('task-agent-start-run');
    await expect(startButton).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await startButton.click();

    const workflowPanel = page.getByTestId('task-workflow-panel');
    await expect(workflowPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(workflowPanel).toContainText(/Review the Mastra migration/i);
    await expect(page.getByTestId('task-agent-confirm-run')).toBeVisible();
    await page.getByTestId('task-agent-confirm-run').click();

    const result = page.getByTestId('task-workflow-result');
    await expect(result).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(result).toContainText(/task-plan-e2e-mastra-1/i);
    expect(telemetry.taskWorkflowStartCount).toBe(1);
    expect(telemetry.taskWorkflowApproveCount).toBe(1);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] cancels task.create at approval without invoking a legacy runtime', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-task-create').click();
    await sendComposerMessage(page, 'Draft a task but do not create it until I approve.');
    await page.getByTestId('task-agent-start-run').click();

    const workflowPanel = page.getByTestId('task-workflow-panel');
    await expect(page.getByTestId('task-agent-cancel-run')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await page.getByTestId('task-agent-cancel-run').click();
    await expect(workflowPanel).toContainText(/cancelled/i, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    expect(telemetry.taskWorkflowCancelCount).toBe(1);
    expect(telemetry.taskWorkflowApproveCount).toBe(0);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] asks the personal knowledge base with citations from the workspace', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-knowledge-qa').click();
    await sendComposerMessage(page, 'How should knowledge answers stay grounded in citations?');

    const askButton = page.getByTestId('knowledge-qa-ask');
    await expect(askButton).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await askButton.click();

    const answerPanel = page.getByTestId('knowledge-answer-panel');
    await expect(answerPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(answerPanel).toContainText(/Grounded answers cite repository excerpts/i);
    await expect(answerPanel).toContainText(/MemoFlow grounding policy/i);
    await expect(answerPanel).toContainText(/notes\/ai\/grounding-policy\.md/i);
    await expect(page.getByTestId('knowledge-citation-open')).toBeVisible();

    await page.getByTestId('knowledge-citation-open').click();
    await expect(page).toHaveURL(/\/repository$/);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] captures a knowledge note through the canonical knowledge.capture Workflow', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-knowledge-capture').click();
    await sendComposerMessage(
      page,
      'Capture this conversation as a reusable note about durable Mastra workflow recovery.',
    );

    const startButton = page.getByTestId('knowledge-capture-agent-start-run');
    await expect(startButton).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await startButton.click();

    const workflowPanel = page.getByTestId('knowledge-capture-workflow-panel');
    await expect(workflowPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(workflowPanel).toContainText(/Conversation Agent Checkpoints/i);
    await expect(page.getByTestId('knowledge-capture-agent-confirm-run')).toBeVisible();
    await page.getByTestId('knowledge-capture-agent-confirm-run').click();

    await expect(page).toHaveURL(/\/repository\?note=resource-note-e2e-mastra-1/i, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    expect(telemetry.knowledgeCaptureStartCount).toBe(1);
    expect(telemetry.knowledgeCaptureApproveCount).toBe(1);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] shows insufficient evidence when knowledge citations are missing', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-knowledge-qa').click();

    await sendComposerMessage(
      page,
      'What does my repository say about the unindexed archive migration plan?',
    );

    const askButton = page.getByTestId('knowledge-qa-ask');
    await expect(askButton).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await askButton.click();

    const answerPanel = page.getByTestId('knowledge-answer-panel');
    await expect(answerPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(answerPanel).toContainText(
      /Current knowledge base evidence is insufficient|当前知识库证据不足/i,
    );
    await expect(answerPanel).toContainText(/I do not have enough repository evidence/i);
    await expect(page.getByTestId('knowledge-citation-open')).toHaveCount(0);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] starts Goal Agent from goal-create tool and cancels at approval', async ({ page }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('ai-chat-composer')).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    // Product path is Goal Agent runtime only; legacy generate-draft UI is gone.
    await expect(page.getByTestId('goal-workflow-generate-draft')).toHaveCount(0);

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await page.getByTestId('ai-chat-tool-goal-create').click();

    await sendComposerMessage(
      page,
      'Create a structured AI workflow goal through the Agent runtime and cancel before approving execution.',
    );

    const startButton = page.getByTestId('goal-agent-start-run');
    await expect(startButton).toBeEnabled({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await startButton.click();

    const workflowPanel = page.getByTestId('goal-workflow-panel');
    await expect(workflowPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(page.getByTestId('goal-agent-confirm-run')).toBeVisible();
    await expect(page.getByTestId('goal-agent-cancel-run')).toBeVisible();
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    await page.getByTestId('goal-agent-cancel-run').click();

    await expect(workflowPanel).toContainText(/cancelled/i, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-agent-confirm-run')).toHaveCount(0);
    await expect(page.getByTestId('goal-agent-cancel-run')).toHaveCount(0);
    expect(telemetry.goalAgentStartCount).toBe(1);
    expect(telemetry.lastGoalAgentStart?.idea ?? '').toMatch(/Agent runtime/i);
    expect(telemetry.lastGoalAgentStart?.providerId).toBe('provider-e2e-openai');
    expect(telemetry.lastGoalAgentStart?.model).toBe('gpt-4.1-mini');
    expect(telemetry.goalAgentCancelCount).toBe(1);
    expect(telemetry.goalAgentApprovalResumeCount).toBe(0);
  });
});

type GoalWorkflowMockOptions = {
  seedConversation?: boolean;
};

type GoalWorkflowMockTelemetry = {
  goalAgentStartCount: number;
  lastGoalAgentStart?: {
    idea?: string;
    providerId?: string;
    model?: string;
  };
  goalAgentApprovalResumeCount: number;
  goalAgentRetryResumeCount: number;
  goalAgentCancelCount: number;
  goalAgentExecuteRequestCount: number;
  goalAgentCompletionResumeCount: number;
  taskWorkflowStartCount: number;
  taskWorkflowApproveCount: number;
  taskWorkflowCancelCount: number;
  knowledgeCaptureStartCount: number;
  knowledgeCaptureApproveCount: number;
  knowledgeCaptureCancelCount: number;
  legacyEndpointCallCount: number;
};

type GoalWorkflowExecutionFailure = {
  operation: 'goal' | 'task_template' | 'reminder';
  index?: number;
  code: string;
  message: string;
  retryable: boolean;
};

/**
 * ADR-052 durable goal.create Workflow simulation.
 *
 * Batch C: the Mastra-owned `/ai/runtime/workflow/*` endpoints are the only
 * authority. There is no `agents/runs` AgentRun / Host Proposal double-track
 * for goal.create anymore — the panel is AIWorkflowRunView-backed
 * (`goal-workflow-panel`) with typed suspensions.
 */
type GoalWorkflowMockRun = {
  runId: string;
  conversationId: string;
  createdAt: number;
  draft: GoalPlanDraft;
  /** Execution simulation state (approved/executed mutations). */
  executedGoalId: string | null;
  executedTaskIds: string[];
  executedReminderIds: string[];
  failures: GoalWorkflowExecutionFailure[];
  executionStatus: 'success' | 'partial' | 'failed';
};

type TaskWorkflowMockRun = {
  runId: string;
  conversationId: string;
  createdAt: number;
  draft: Extract<
    NonNullable<Extract<AIWorkflowRunView, { kind: 'task.create' }>['suspension']>,
    { type: 'task_draft_review' }
  >['draft'];
};

type KnowledgeCaptureMockRun = {
  runId: string;
  conversationId: string;
  createdAt: number;
  draft: Extract<
    NonNullable<Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>['suspension']>,
    { type: 'knowledge_draft_review' }
  >['draft'];
};

function createTaskWorkflowDraft(
  title = 'Review the Mastra migration',
): TaskWorkflowMockRun['draft'] {
  return {
    revision: 1,
    task: {
      title,
      description: 'Verify the Mastra-only task workflow from review to deterministic apply.',
      importance: 'Moderate',
      cadence: 'weekly',
      startDate: null,
      timeOfDay: '09:00',
      daysOfWeek: [1],
      occurrences: null,
      goalId: null,
      keyResultId: null,
      contributionValue: null,
      labels: ['ai', 'mastra'],
    },
    rationale: 'Keep task creation behind the canonical task mutation port.',
    warnings: [],
  };
}

function createKnowledgeCaptureDraft(
  title = 'Conversation Agent Checkpoints',
): KnowledgeCaptureMockRun['draft'] {
  return {
    revision: 1,
    title,
    topic: 'Durable Mastra workflow recovery and checkpoint ownership',
    markdown: [
      `# ${title}`,
      '',
      'Mastra owns the durable workflow state while product mutations stay behind canonical ports.',
    ].join('\n'),
    targetSubpath: 'notes/ai',
    tags: ['ai', 'mastra'],
    duplicateRisk: 'low',
  };
}

function createTaskReviewRun(mockRun: TaskWorkflowMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'task.create',
    conversationId: mockRun.conversationId,
    status: 'suspended',
    suspension: {
      type: 'task_draft_review',
      draft: mockRun.draft,
      warnings: mockRun.draft.warnings,
      revision: mockRun.draft.revision,
    },
    createdAt: mockRun.createdAt,
    updatedAt: Date.now(),
  };
}

function createTaskCompletedRun(mockRun: TaskWorkflowMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'task.create',
    conversationId: mockRun.conversationId,
    status: 'completed',
    result: {
      workflowRunId: mockRun.runId,
      revision: mockRun.draft.revision,
      status: 'success',
      taskPlanId: 'task-plan-e2e-mastra-1',
      taskIds: ['task-occurrence-e2e-mastra-1'],
      failures: [],
      retryable: false,
    },
    createdAt: mockRun.createdAt,
    updatedAt: Date.now(),
  };
}

function createTaskCancelledRun(mockRun: TaskWorkflowMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'task.create',
    conversationId: mockRun.conversationId,
    status: 'cancelled',
    createdAt: mockRun.createdAt,
    updatedAt: Date.now(),
  };
}

function createKnowledgeCaptureReviewRun(mockRun: KnowledgeCaptureMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'knowledge.capture',
    conversationId: mockRun.conversationId,
    status: 'suspended',
    suspension: {
      type: 'knowledge_draft_review',
      draft: mockRun.draft,
      warnings: [],
      revision: mockRun.draft.revision,
    },
    createdAt: mockRun.createdAt,
    updatedAt: Date.now(),
  };
}

function createKnowledgeCaptureCompletedRun(mockRun: KnowledgeCaptureMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'knowledge.capture',
    conversationId: mockRun.conversationId,
    status: 'completed',
    result: {
      workflowRunId: mockRun.runId,
      revision: mockRun.draft.revision,
      status: 'success',
      noteId: 'resource-note-e2e-mastra-1',
      noteName: `${mockRun.draft.title}.md`,
      notePath: `notes/ai/${mockRun.draft.title}.md`,
      failures: [],
      retryable: false,
    },
    createdAt: mockRun.createdAt,
    updatedAt: Date.now(),
  };
}

function createKnowledgeCaptureCancelledRun(mockRun: KnowledgeCaptureMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'knowledge.capture',
    conversationId: mockRun.conversationId,
    status: 'cancelled',
    createdAt: mockRun.createdAt,
    updatedAt: Date.now(),
  };
}

function createRestoredGoalWorkflowDraft(): GoalPlanDraft {
  const now = Date.now();
  return {
    revision: 1,
    goal: {
      name: 'Restored AI Agent workspace',
      description: 'A pending approval run restored from local workflow state.',
      motivation: 'Restore the runtime-owned durable goal.create run after refresh.',
      feasibilityAnalysis: 'Scoped to goal and key result creation after confirmation.',
      startDate: now,
      dueDate: now + 60 * 24 * 60 * 60 * 1000,
    },
    keyResults: [
      {
        title: 'Complete the restored workflow approval',
        description: 'Confirm the pending workflow from the durable run.',
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
    rationale: 'Create the restored Agent goal after user approval.',
    warnings: [],
  };
}

function createPendingApprovalWorkflowEntry() {
  const now = Date.now();
  const draft = createRestoredGoalWorkflowDraft();

  return {
    mode: 'goal-create',
    goalWorkflowStage: 'confirm',
    goalWorkflowRun: {
      runId: 'workflow-e2e-restored-approval',
      kind: 'goal.create',
      conversationId: e2eConversationId,
      status: 'suspended',
      suspension: {
        type: 'goal_draft_review',
        draft,
        warnings: draft.warnings,
        revision: draft.revision,
      },
      createdAt: now,
      updatedAt: now,
    },
    knowledgeAnswer: null,
    clarificationAnswers: [],
    editableGoal: {
      name: draft.goal.name,
      description: draft.goal.description,
      motivation: draft.goal.motivation ?? '',
      feasibilityAnalysis: draft.goal.feasibilityAnalysis ?? '',
      startDate: draft.goal.startDate,
      dueDate: draft.goal.dueDate,
    },
    editableKeyResults: [],
    editableTaskPlans: [],
    editableReminders: [],
    showGoalDraftEditor: false,
  };
}

function createPendingTaskApprovalWorkflowEntry() {
  const now = Date.now();
  const mockRun: TaskWorkflowMockRun = {
    runId: 'workflow-e2e-restored-task-approval',
    conversationId: e2eConversationId,
    createdAt: now,
    draft: createTaskWorkflowDraft('Restored Mastra task workflow'),
  };
  return {
    mode: 'task-create',
    taskWorkflowRun: createTaskReviewRun(mockRun),
    goalWorkflowRun: null,
    knowledgeCaptureRun: null,
    knowledgeAnswer: null,
    clarificationAnswers: [],
    editableGoal: {
      name: '',
      description: '',
      motivation: '',
      feasibilityAnalysis: '',
      startDate: null,
      dueDate: null,
    },
    editableKeyResults: [],
    editableTaskPlans: [],
    editableReminders: [],
    showGoalDraftEditor: false,
  };
}

function createGoalAgentWorkflowDraft(): GoalPlanDraft {
  const now = Date.now();
  return {
    revision: 1,
    goal: {
      name: 'Agent-created AI workflow',
      description: 'Create a structured goal through the Mastra Workflow runtime.',
      motivation: 'Turn the Agent plan into tracked execution.',
      feasibilityAnalysis: 'The approved plan is scoped to goal and KR creation.',
      startDate: now,
      dueDate: now + 60 * 24 * 60 * 60 * 1000,
    },
    keyResults: [
      {
        title: 'Run the Goal Agent workflow end to end',
        description: 'Confirm Mastra Workflow execution through the controlled executor.',
        calculationMethod: 'Sum',
        startingValue: 0,
        progressBaselineValue: null,
        currentValue: 0,
        targetValue: 1,
        unit: 'workflow',
        weight: 3,
      },
    ],
    taskPlans: [
      {
        name: 'Review Agent execution',
        description: 'Check result and recovery.',
        importance: 'Moderate',
        cadence: 'weekly',
        startDate: now,
        timeOfDay: '09:00',
        daysOfWeek: [1],
        occurrences: null,
        keyResultIndex: 0,
        contributionValue: 1,
        labels: [],
      },
    ],
    reminders: [
      {
        title: 'Review Agent result',
        description: 'Review failed actions.',
        importance: 'Moderate',
        cadence: 'weekly',
        scheduledAt: now,
        timeOfDay: '09:00',
        timezone: null,
        channels: ['InApp'],
        tags: [],
      },
    ],
    rationale:
      'Create the approved goal draft with a measurable key result, task template, and reminder.',
    warnings: [],
  };
}

function createGoalWorkflowMockRun(request: {
  runId?: string;
  conversationId?: string | null;
}): GoalWorkflowMockRun {
  const draft = createGoalAgentWorkflowDraft();
  return {
    runId: request.runId ?? 'workflow-e2e-goal-1',
    conversationId: request.conversationId ?? e2eConversationId,
    createdAt: Date.now(),
    draft,
    executedGoalId: null,
    executedTaskIds: [],
    executedReminderIds: [],
    failures: [],
    executionStatus: 'failed',
  };
}

function goalReviewSuspension(
  draft: GoalPlanDraft,
): NonNullable<Extract<AIWorkflowRunView, { kind: 'goal.create' }>['suspension']> {
  // E2E mock: draft fields carry the canonical GoalPlanDraft contract shape at
  // runtime; the loose local type is only for authoring ergonomics. The client
  // re-validates with AIWorkflowRunViewSchema before projection, so malformed
  // fixtures fail loudly rather than silently.
  return {
    type: 'goal_draft_review',
    draft: draft as unknown as NonNullable<
      Extract<AIWorkflowRunView, { kind: 'goal.create' }>['suspension']
    > extends { type: 'goal_draft_review' }
      ? Extract<AIWorkflowRunView, { kind: 'goal.create' }>['suspension']
      : never,
    warnings: draft.warnings,
    revision: draft.revision,
  } as NonNullable<Extract<AIWorkflowRunView, { kind: 'goal.create' }>['suspension']>;
}

function createGoalReviewRun(mockRun: GoalWorkflowMockRun): AIWorkflowRunView {
  const now = Date.now();
  return {
    runId: mockRun.runId,
    kind: 'goal.create',
    conversationId: mockRun.conversationId,
    status: 'suspended',
    suspension: goalReviewSuspension(mockRun.draft),
    createdAt: mockRun.createdAt,
    updatedAt: now,
  };
}

function createGoalRecoveryRun(mockRun: GoalWorkflowMockRun): AIWorkflowRunView {
  const now = Date.now();
  return {
    runId: mockRun.runId,
    kind: 'goal.create',
    conversationId: mockRun.conversationId,
    status: 'suspended',
    suspension: {
      type: 'recovery_required',
      message: 'Some goal plan mutations failed.',
      retryable: true,
      failures: mockRun.failures,
    },
    result: {
      workflowRunId: mockRun.runId,
      revision: mockRun.draft.revision,
      status: mockRun.executionStatus,
      goalId: mockRun.executedGoalId ?? undefined,
      keyResultIds: [],
      taskIds: mockRun.executedTaskIds,
      reminderIds: mockRun.executedReminderIds,
      failures: mockRun.failures,
      retryable: true,
    },
    createdAt: mockRun.createdAt,
    updatedAt: now,
  };
}

function createGoalCompletedRun(mockRun: GoalWorkflowMockRun): AIWorkflowRunView {
  const now = Date.now();
  return {
    runId: mockRun.runId,
    kind: 'goal.create',
    conversationId: mockRun.conversationId,
    status: 'completed',
    result: {
      workflowRunId: mockRun.runId,
      revision: mockRun.draft.revision,
      status: mockRun.executionStatus,
      goalId: mockRun.executedGoalId ?? undefined,
      keyResultIds: mockRun.draft.keyResults.map((_, index) => `kr-e2e-${index + 1}`),
      taskIds: mockRun.executedTaskIds,
      reminderIds: mockRun.executedReminderIds,
      failures: mockRun.failures,
      retryable: false,
    },
    createdAt: mockRun.createdAt,
    updatedAt: now,
  };
}

function createCancelledRun(mockRun: GoalWorkflowMockRun): AIWorkflowRunView {
  const now = Date.now();
  return {
    runId: mockRun.runId,
    kind: 'goal.create',
    conversationId: mockRun.conversationId,
    status: 'cancelled',
    createdAt: mockRun.createdAt,
    updatedAt: now,
  };
}

function executeGoalWorkflowMockRun(
  mockRun: GoalWorkflowMockRun,
  telemetry: GoalWorkflowMockTelemetry,
) {
  telemetry.goalAgentExecuteRequestCount += 1;
  const retrySucceeded = telemetry.goalAgentExecuteRequestCount > 1;

  mockRun.executedGoalId = 'goal-e2e-1';
  if (retrySucceeded) {
    mockRun.executedTaskIds = ['task-plan-e2e-1'];
    mockRun.executedReminderIds = ['reminder-e2e-1'];
    mockRun.failures = [];
    mockRun.executionStatus = 'success';
  } else {
    mockRun.executedTaskIds = [];
    mockRun.executedReminderIds = ['reminder-e2e-1'];
    mockRun.failures = [
      {
        operation: 'task_template',
        index: 0,
        code: 'KEY_RESULT_FAILED',
        message: '关键结果创建失败，字段仍需修正。',
        retryable: true,
      },
    ];
    mockRun.executionStatus = 'partial';
  }
}

async function installGoalWorkflowMocks(
  page: Page,
  options: GoalWorkflowMockOptions = {},
): Promise<GoalWorkflowMockTelemetry> {
  const conversationId = e2eConversationId;
  let conversationName = 'Goal Workflow Session';
  let generateGoalStep = options.seedConversation ? 1 : 0;
  const telemetry: GoalWorkflowMockTelemetry = {
    goalAgentStartCount: 0,
    goalAgentApprovalResumeCount: 0,
    goalAgentRetryResumeCount: 0,
    goalAgentCancelCount: 0,
    goalAgentExecuteRequestCount: 0,
    goalAgentCompletionResumeCount: 0,
    taskWorkflowStartCount: 0,
    taskWorkflowApproveCount: 0,
    taskWorkflowCancelCount: 0,
    knowledgeCaptureStartCount: 0,
    knowledgeCaptureApproveCount: 0,
    knowledgeCaptureCancelCount: 0,
    legacyEndpointCallCount: 0,
  };
  await page.route('**/api/v1/settings/preferences', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await fulfillJson(
      route,
      {
        ...createDefaultUserPreferenceProfile(),
        presentation: { theme: 'light', language: 'en-US' },
        regional: {
          timeZone: 'Asia/Shanghai',
          dateStyle: 'medium',
          timeStyle: '24h',
          weekStartsOn: 1,
        },
      },
    );
  });

  await page.route('**/api/v1/ai/providers', async (route) => {
    await fulfillJson(route, {
      data: [
        {
          id: 'provider-e2e-openai',
          identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
          name: 'E2E OpenAI',
          providerType: 'openai_compatible',
          baseUrl: 'https://api.openai.com/v1',
          apiKeyMasked: 'sk-****e2e',
          defaultModel: 'gpt-4.1-mini',
          availableModels: [{ id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' }],
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

  await page.route('**/api/v1/ai/chat/conversations?*', async (route) => {
    const conversations =
      generateGoalStep > 0
        ? [{ id: conversationId, name: conversationName, title: conversationName }]
        : [];
    await fulfillJson(route, {
      data: conversations,
      total: conversations.length,
      page: 1,
      pageSize: 24,
    });
  });

  await page.route('**/api/v1/ai/chat/conversations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const body = route.request().postDataJSON() as { name?: string };
    conversationName = body.name || conversationName;
    // Residual 1333: after create, listConversations must return this id.
    // Otherwise loadConversationList after open-chat completion calls
    // startNewConversation() and wipes hasWorkflowUserMessages.
    generateGoalStep = Math.max(generateGoalStep, 1);

    await fulfillJson(route, {
      id: conversationId,
      identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
      name: conversationName,
      status: 'Active',
      messageCount: 0,
      lastMessageAt: null,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      messages: null,
    });
  });

  await page.route(`**/api/v1/ai/chat/conversations/${conversationId}`, async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as { name?: string };
      conversationName = body.name || conversationName;
      await fulfillJson(route, {
        id: conversationId,
        identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
        name: conversationName,
        status: 'Active',
        messageCount: 2,
        lastMessageAt: Date.now(),
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        messages: null,
      });
      return;
    }

    if (method === 'GET') {
      await fulfillJson(route, {
        id: conversationId,
        identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
        name: conversationName,
        status: 'Active',
        messageCount: 2,
        lastMessageAt: Date.now(),
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        messages: null,
      });
      return;
    }

    await route.continue();
  });

  // Batch B: Mastra owns default open-chat transcript persistence. These messages
  // are returned only by the canonical runtime history route.
  const openChatMessages: Array<{
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: number;
  }> = [];

  await page.route('**/api/v1/ai/runtime/assistant/history', async (route) => {
    const request = (route.request().postDataJSON() ?? {}) as { conversationId?: string };
    expect(request).not.toHaveProperty('identityId');
    await fulfillJson(route, {
      conversationId: request.conversationId ?? conversationId,
      messages: openChatMessages,
    });
  });

  await page.route('**/api/v1/ai/runtime/assistant/sse', async (route) => {
    const request = (route.request().postDataJSON() ?? {}) as {
      type?: string;
      content?: string;
      conversationId?: string;
      surface?: string;
      providerId?: string;
      modelId?: string;
    };
    expect(request).not.toHaveProperty('identityId');
    expect(request).not.toHaveProperty('executionProfileId');
    expect(request.type).toBe('message');
    expect(request.surface).toBe('web');
    expect(request.providerId).toBe('provider-e2e-openai');
    expect(request.modelId).toBe('gpt-4.1-mini');

    const userContent = request.content ?? '';
    const now = Date.now();
    const convId = request.conversationId ?? conversationId;
    const turn = Math.floor(openChatMessages.length / 2) + 1;
    const runId = `run-e2e-mastra-goal-workflow-${turn}`;
    const userMsgId = `msg-user-${turn}`;
    const assistantMsgId = `msg-assistant-${turn}`;
    const assistantContent = '先把目标拆清楚，我会帮你补全 workflow。';
    if (userContent.trim()) {
      openChatMessages.push(
        {
          id: userMsgId,
          conversationId: convId,
          role: 'user',
          content: userContent,
          createdAt: now,
        },
        {
          id: assistantMsgId,
          conversationId: convId,
          role: 'assistant',
          content: assistantContent,
          createdAt: now + 1,
        },
      );
    }
    generateGoalStep = Math.max(generateGoalStep, 1);

    const events = [
      {
        eventId: `${runId}:1`,
        runId,
        conversationId: convId,
        sequence: 1,
        createdAt: now,
        type: 'assistant.run.started',
        data: { providerId: 'provider-e2e-openai', modelId: 'gpt-4.1-mini' },
      },
      {
        eventId: `${runId}:2`,
        runId,
        conversationId: convId,
        sequence: 2,
        createdAt: now,
        type: 'assistant.message.delta',
        data: { content: assistantContent },
      },
      {
        eventId: `${runId}:3`,
        runId,
        conversationId: convId,
        sequence: 3,
        createdAt: now,
        type: 'assistant.run.completed',
        data: { content: assistantContent, assistantMessageId: assistantMsgId },
      },
    ];
    const body = events
      .map((event) => `event: runtime\ndata: ${JSON.stringify(event)}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body,
      headers: {
        'cache-control': 'no-cache',
        'content-length': String(Buffer.byteLength(body, 'utf8')),
        connection: 'close',
      },
    });
  });

  // AI-VNEXT-07 architecture lock: no UI journey may fall back to AssistantFacade.
  await page.route('**/api/v1/ai/assistant/dispatch/sse', async (route) => {
    telemetry.legacyEndpointCallCount += 1;
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Legacy AssistantFacade endpoint is retired' }),
    });
  });

  await page.route('**/api/v1/ai/knowledge/query', async (route) => {
    const request = route.request().postDataJSON() as {
      query?: string;
      maxResources?: number;
      providerId?: string;
    };

    expect(request.maxResources).toBe(8);
    expect(request.providerId).toBe('provider-e2e-openai');

    const query = request.query ?? '';

    if (query.includes('unindexed archive migration plan')) {
      await fulfillJson(route, {
        answer:
          'I do not have enough repository evidence to answer this from your indexed knowledge base.',
        citations: [],
        providerId: 'provider-e2e-openai',
        tokenUsage: {
          promptTokens: 48,
          completionTokens: 18,
          totalTokens: 66,
        },
        processingTimeMs: 54,
        matchedResourceCount: 0,
      });
      return;
    }

    expect(query).toContain('knowledge answers stay grounded');

    await fulfillJson(route, {
      answer: 'Grounded answers cite repository excerpts and show where each claim came from.',
      citations: [
        {
          resourceId: 'resource-grounding-1',
          resourcePath: 'notes/ai/grounding-policy.md',
          title: 'MemoFlow grounding policy',
          chunkIndex: 0,
          excerpt: 'Knowledge answers must cite repository evidence before sounding certain.',
          score: 0.94,
        },
      ],
      providerId: 'provider-e2e-openai',
      tokenUsage: {
        promptTokens: 64,
        completionTokens: 24,
        totalTokens: 88,
      },
      processingTimeMs: 75,
      matchedResourceCount: 1,
    });
  });

  // AI-VNEXT-07: goal.create, task.create and knowledge.capture are all owned by
  // the canonical durable Mastra Workflow runtime. No AgentRun/HostProposal seam exists.
  const workflowRunsByRunId = new Map<string, GoalWorkflowMockRun>();
  const taskWorkflowRunsByRunId = new Map<string, TaskWorkflowMockRun>();
  const knowledgeCaptureRunsByRunId = new Map<string, KnowledgeCaptureMockRun>();

  const restoredApprovalRun = createGoalWorkflowMockRun({
    runId: 'workflow-e2e-restored-approval',
    conversationId,
  });
  restoredApprovalRun.draft = createRestoredGoalWorkflowDraft();
  const restoredTaskApprovalRun: TaskWorkflowMockRun = {
    runId: 'workflow-e2e-restored-task-approval',
    conversationId,
    createdAt: Date.now(),
    draft: createTaskWorkflowDraft('Restored Mastra task workflow'),
  };

  await page.route('**/api/v1/ai/runtime/workflow/start', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const request = route.request().postDataJSON() as {
      kind?: string;
      conversationId?: string;
      input?: { idea?: string; topic?: string; goalId?: string };
      providerId?: string;
      modelId?: string;
      locale?: string;
    };
    expect(request).not.toHaveProperty('identityId');
    expect(request.conversationId).toBeTruthy();
    expect(request.providerId).toBe('provider-e2e-openai');
    expect(request.modelId).toBe('gpt-4.1-mini');

    if (request.kind === 'goal.create') {
      expect(request.input?.idea?.trim().length).toBeGreaterThan(0);
      telemetry.goalAgentStartCount += 1;
      telemetry.lastGoalAgentStart = {
        idea: request.input?.idea,
        providerId: request.providerId,
        model: request.modelId,
      };
      const mockRun = createGoalWorkflowMockRun({ conversationId: request.conversationId });
      workflowRunsByRunId.set(mockRun.runId, mockRun);
      await fulfillJson(route, createGoalReviewRun(mockRun));
      return;
    }

    if (request.kind === 'task.create') {
      expect(request.input?.idea?.trim().length).toBeGreaterThan(0);
      telemetry.taskWorkflowStartCount += 1;
      const mockRun: TaskWorkflowMockRun = {
        runId: `workflow-e2e-task-${telemetry.taskWorkflowStartCount}`,
        conversationId: request.conversationId ?? conversationId,
        createdAt: Date.now(),
        draft: createTaskWorkflowDraft(),
      };
      taskWorkflowRunsByRunId.set(mockRun.runId, mockRun);
      await fulfillJson(route, createTaskReviewRun(mockRun));
      return;
    }

    if (request.kind === 'knowledge.capture') {
      expect(request.input?.topic?.trim().length).toBeGreaterThan(0);
      telemetry.knowledgeCaptureStartCount += 1;
      const mockRun: KnowledgeCaptureMockRun = {
        runId: `workflow-e2e-knowledge-${telemetry.knowledgeCaptureStartCount}`,
        conversationId: request.conversationId ?? conversationId,
        createdAt: Date.now(),
        draft: createKnowledgeCaptureDraft(),
      };
      knowledgeCaptureRunsByRunId.set(mockRun.runId, mockRun);
      await fulfillJson(route, createKnowledgeCaptureReviewRun(mockRun));
      return;
    }

    throw new Error(`Unexpected vNext workflow kind: ${String(request.kind)}`);
  });

  await page.route('**/api/v1/ai/runtime/workflow/get', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const request = route.request().postDataJSON() as { runId?: string };
    expect(request).not.toHaveProperty('identityId');

    if (request.runId === restoredApprovalRun.runId) {
      await fulfillJson(route, createGoalReviewRun(restoredApprovalRun));
      return;
    }
    if (request.runId === restoredTaskApprovalRun.runId) {
      await fulfillJson(route, createTaskReviewRun(restoredTaskApprovalRun));
      return;
    }
    const goalRun = workflowRunsByRunId.get(request.runId ?? '');
    if (goalRun) {
      await fulfillJson(route, createGoalReviewRun(goalRun));
      return;
    }
    const taskRun = taskWorkflowRunsByRunId.get(request.runId ?? '');
    if (taskRun) {
      await fulfillJson(route, createTaskReviewRun(taskRun));
      return;
    }
    const captureRun = knowledgeCaptureRunsByRunId.get(request.runId ?? '');
    await fulfillJson(route, captureRun ? createKnowledgeCaptureReviewRun(captureRun) : null);
  });

  await page.route('**/api/v1/ai/runtime/workflow/list', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const request = route.request().postDataJSON() as Record<string, unknown>;
    expect(request).not.toHaveProperty('identityId');
    await fulfillJson(route, []);
  });

  await page.route('**/api/v1/ai/runtime/workflow/resume', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const request = route.request().postDataJSON() as {
      runId?: string;
      command?: { type?: string };
    };
    expect(request).not.toHaveProperty('identityId');
    const commandType = request.command?.type;
    const runId = request.runId ?? '';

    const taskRun =
      taskWorkflowRunsByRunId.get(runId) ||
      (runId === restoredTaskApprovalRun.runId ? restoredTaskApprovalRun : undefined);
    if (taskRun) {
      if (commandType === 'cancel') {
        telemetry.taskWorkflowCancelCount += 1;
        await fulfillJson(route, createTaskCancelledRun(taskRun));
        return;
      }
      if (commandType === 'approve') {
        telemetry.taskWorkflowApproveCount += 1;
        await fulfillJson(route, createTaskCompletedRun(taskRun));
        return;
      }
      if (commandType === 'edit_structured') {
        await fulfillJson(route, createTaskReviewRun(taskRun));
        return;
      }
      throw new Error(`Unexpected task.create resume command: ${String(commandType)}`);
    }

    const captureRun = knowledgeCaptureRunsByRunId.get(runId);
    if (captureRun) {
      if (commandType === 'cancel') {
        telemetry.knowledgeCaptureCancelCount += 1;
        await fulfillJson(route, createKnowledgeCaptureCancelledRun(captureRun));
        return;
      }
      if (commandType === 'approve') {
        telemetry.knowledgeCaptureApproveCount += 1;
        await fulfillJson(route, createKnowledgeCaptureCompletedRun(captureRun));
        return;
      }
      if (commandType === 'edit_structured') {
        await fulfillJson(route, createKnowledgeCaptureReviewRun(captureRun));
        return;
      }
      throw new Error(`Unexpected knowledge.capture resume command: ${String(commandType)}`);
    }

    const mockRun =
      workflowRunsByRunId.get(runId) ||
      (runId === restoredApprovalRun.runId ? restoredApprovalRun : undefined);
    if (commandType === 'cancel') {
      telemetry.goalAgentCancelCount += 1;
      await fulfillJson(route, createCancelledRun(mockRun ?? restoredApprovalRun));
      return;
    }
    if (commandType === 'retry') {
      telemetry.goalAgentRetryResumeCount += 1;
      if (mockRun) executeGoalWorkflowMockRun(mockRun, telemetry);
      telemetry.goalAgentCompletionResumeCount += 1;
      await fulfillJson(route, createGoalCompletedRun(mockRun ?? restoredApprovalRun));
      return;
    }
    if (commandType === 'approve') {
      telemetry.goalAgentApprovalResumeCount += 1;
      if (mockRun) executeGoalWorkflowMockRun(mockRun, telemetry);
      const completed = mockRun && mockRun.executionStatus === 'success';
      if (completed) telemetry.goalAgentCompletionResumeCount += 1;
      await fulfillJson(
        route,
        completed
          ? createGoalCompletedRun(mockRun)
          : createGoalRecoveryRun(mockRun ?? restoredApprovalRun),
      );
      return;
    }
    if (commandType === 'edit_structured') {
      await fulfillJson(route, createGoalReviewRun(mockRun ?? restoredApprovalRun));
      return;
    }
    throw new Error(`Unexpected goal.create resume command: ${String(commandType)}`);
  });

  await page.route('**/api/v1/ai/runtime/workflow/cancel', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const request = route.request().postDataJSON() as { runId?: string };
    expect(request).not.toHaveProperty('identityId');
    const runId = request.runId ?? '';
    const taskRun = taskWorkflowRunsByRunId.get(runId);
    if (taskRun) {
      telemetry.taskWorkflowCancelCount += 1;
      await fulfillJson(route, createTaskCancelledRun(taskRun));
      return;
    }
    const captureRun = knowledgeCaptureRunsByRunId.get(runId);
    if (captureRun) {
      telemetry.knowledgeCaptureCancelCount += 1;
      await fulfillJson(route, createKnowledgeCaptureCancelledRun(captureRun));
      return;
    }
    const goalRun = workflowRunsByRunId.get(runId) ?? restoredApprovalRun;
    telemetry.goalAgentCancelCount += 1;
    await fulfillJson(route, createCancelledRun(goalRun));
  });

  await page.route('**/api/v1/ai/agents/runs**', async (route) => {
    telemetry.legacyEndpointCallCount += 1;
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Legacy AgentRun endpoint is retired' }),
    });
  });

  await page.route('**/api/v1/ai/knowledge-notes', async (route) => {
    telemetry.legacyEndpointCallCount += 1;
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Legacy knowledge-note generation endpoint is retired' }),
    });
  });

  await page.route('**/api/v1/ai/generate/goal', async (route) => {
    telemetry.legacyEndpointCallCount += 1;
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Legacy goal-generation endpoint is retired' }),
    });
  });

  return telemetry;
}

async function fulfillJson(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data,
    }),
  });
}
