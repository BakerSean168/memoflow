import { createHash } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import {
  AIWorkflowRunViewSchema,
  KnowledgeDraftSchema,
  TaskPlanDraftContentSchema,
} from '@memoflow/contracts/ai';
import type {
  AIWorkflowRunView,
  GoalPlanDraft,
  GoalPlanExecutionFailure,
} from '@memoflow/contracts/ai';
import {
  KnowledgeNoteProjectionClientSchema,
  KnowledgeNoteProjectionListResponseSchema,
  KnowledgeNoteTreeResponseSchema,
  ListKnowledgeRepositoryConnectionsResSchema,
} from '@memoflow/contracts/repository';
import { CreateTaskPlanSchema, type CreateTaskPlanReq } from '@memoflow/contracts/task';
import type { CreateGoalReq } from '@memoflow/contracts/goal';
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
      retiredConversationWorkflowStorageKey,
      legacyGoalWorkflowStorageKey,
      seededConversationId,
      seededModelKey,
      seededWorkflowEntry,
    }) => {
      window.localStorage.removeItem(lastModelStorageKey);
      // AI-9603: durable WorkflowRun snapshots are retired. Only the v3 active-run
      // pointer may survive a reload; the authoritative run is reloaded from Mastra.
      window.localStorage.removeItem(retiredConversationWorkflowStorageKey);
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
      conversationWorkflowStorageKey: 'ai:conversation-workflow-map:v3',
      retiredConversationWorkflowStorageKey: 'ai:conversation-workflow-map:v2',
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

    await sendComposerMessage(
      page,
      'Ask my knowledge base how knowledge answers stay grounded in citations.',
    );

    // Workflow output lives in the mutually exclusive right-side surface on mobile.
    // The header badge signals that context is available; switch back to focus to inspect it.
    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'focus');
    await expect(page.getByTestId('business-panel')).toBeVisible();

    const workflowTab = page.getByTestId('business-panel-workflow');
    await expect(workflowTab).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await workflowTab.click();

    await expect(page.getByTestId('knowledge-answer-panel')).toBeVisible({
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

    // Native GoalDialog owns visible review; the durable Workflow projection may be hidden.
    const workflowPanel = page.getByTestId('goal-workflow-panel');
    await expect(workflowPanel).toHaveCount(1);
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(page.getByTestId('goal-dialog')).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue('Restored AI Agent workspace');
    await expect(
      page.getByTestId('goal-dialog').getByTestId('goal-key-result-draft-row'),
    ).toContainText('Complete the restored workflow approval');
    await expect(page.getByTestId('goal-dialog').getByTestId('save-goal-button')).toBeVisible();
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    // Full main-app remount after reload needs NAVIGATION budget (same as bootstrap).
    await expect(page.getByTestId('goal-dialog')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    await expect(page.getByTestId('goal-name-input')).toHaveValue('Restored AI Agent workspace');
    await expect(
      page.getByTestId('goal-dialog').getByTestId('goal-key-result-draft-row'),
    ).toContainText('Complete the restored workflow approval');
    await expect(workflowPanel).toHaveCount(1);
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(page.getByTestId('goal-dialog').getByTestId('save-goal-button')).toBeVisible();
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);
  });

  test('[P0] completes Goal Agent confirmation through the controlled executor and retries failed actions', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    const draft = createGoalAgentWorkflowDraft();

    await sendComposerMessage(
      page,
      'Create a structured AI workflow goal through the Agent runtime and execute the approved plan.',
    );

    // Unified composer intent detection starts goal.create automatically. ADR-052:
    // goal.create renders in the durable Workflow panel, not a
    // legacy goal-agent-panel.
    const workflowPanel = page.getByTestId('goal-workflow-panel');
    await expect(workflowPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(workflowPanel).toContainText(/suspended/i);
    const ownerGoalId = telemetry.lastGoalWorkflowOwnerCreate?.goalId;
    expect(ownerGoalId).toBeTruthy();
    await expect(page.getByTestId('goal-dialog')).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draft.goal.name);
    await expect(
      page.getByTestId('goal-dialog').getByTestId('goal-key-result-draft-row'),
    ).toContainText(draft.keyResults[0].title);
    await expect(workflowPanel).toContainText(/Agent-created AI workflow/i);
    await expect(workflowPanel).toContainText(/Run the Goal Agent workflow end to end/i);
    // Task and Knowledge details render inside the optional draft editor; the review card
    // stays a compact projection of Goal/KR/rationale.
    await expect(workflowPanel).toContainText(
      /Create the approved goal draft with a measurable key result/i,
    );
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    // Owner-native controlled confirmation: native Save delegates through the workflow
    // coordinator; it is not an independent direct create.
    await page.getByTestId('goal-dialog').getByTestId('save-goal-button').click();
    await expect(page.getByTestId('goal-dialog')).toBeHidden({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    // Native Goal creation returns to Goals; select Workflow to inspect recovery.
    await page.getByTestId('business-panel-workflow').click();

    // Controlled executor: the first approved execution is partial, so the
    // durable runtime suspends with a recovery_required suspension.
    await expect(page.getByTestId('goal-workflow-recovery')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-workflow-recovery')).toContainText(/TASK_CREATE_FAILED/i);
    await expect(page.getByTestId('goal-workflow-recovery')).toContainText(
      /Workflow execution failed/i,
    );
    expect(telemetry.goalAgentStartCount).toBe(1);
    expect(telemetry.lastGoalAgentStart?.idea ?? '').toMatch(/Agent runtime/i);
    expect(telemetry.lastGoalAgentStart?.providerId).toBe('provider-e2e-openai');
    expect(telemetry.lastGoalAgentStart?.model).toBe('gpt-4.1-mini');
    expect(telemetry.ownerGoalCreateCount).toBe(1);
    expect(telemetry.goalConfirmationEvents).toEqual(['owner_create', 'approve']);
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
    await expect(page).toHaveURL(new RegExp(`/goals/${ownerGoalId}$`), {
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
    const dialog = page.getByTestId('task-plan-dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('task-plan-title-input')).toHaveValue(
      'Restored Mastra task workflow',
    );
    await expect(page.getByTestId('task-workflow-draft-editor')).toHaveCount(0);
    await expect(page.locator('#quick-task-form')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('task-plan-title-input')).toHaveValue(
      'Restored Mastra task workflow',
    );
    expect(telemetry.ownerTaskCreateCount).toBe(0);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] completes task.create through native full TaskPlanDialog before Mastra approve', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    await sendComposerMessage(page, 'Create a weekly task to review the Mastra-only AI migration.');
    const dialog = page.getByTestId('task-plan-dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(page.getByTestId('task-plan-title-input')).toHaveValue(
      'Review the Mastra migration',
    );
    await page.getByTestId('task-recurrence-chip').click();
    await expect(page.getByTestId('task-recurrence-popover')).toBeVisible();
    await expect(page.locator('#task-recurrence-frequency')).toContainText(/week/i);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-workflow-draft-editor')).toHaveCount(0);
    await expect(page.locator('#quick-task-form')).toHaveCount(0);
    // A manual native edit must be saved to Mastra before its fresh identity is submitted.
    await page.getByTestId('task-plan-title-input').fill('Review the Mastra migration today');
    await page.getByTestId('task-dialog-save-button').click();
    await expect(dialog).not.toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect.poll(() => telemetry.taskWorkflowApproveCount).toBe(1);
    expect(telemetry.ownerTaskCreateCount).toBe(1);
    expect(telemetry.lastOwnerTaskCreateBody?.name).toBe('Review the Mastra migration today');
    expect(telemetry.taskConfirmationEvents).toEqual(['owner_create', 'approve']);
    const canonicalId = telemetry.lastOwnerTaskCreateBody?.id;
    expect(canonicalId).toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`/tasks/${canonicalId}$`));
    await expect(page.getByTestId('task-workflow-draft-editor')).toHaveCount(0);
    expect(telemetry.taskWorkflowStartCount).toBe(1);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] cancels task.create at approval and closes native review without creating Task', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    await sendComposerMessage(page, 'Draft a task but do not create it until I approve.');
    const dialog = page.getByTestId('task-plan-dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => telemetry.taskWorkflowCancelCount).toBe(1);
    expect(telemetry.ownerTaskCreateCount).toBe(0);
    expect(telemetry.taskWorkflowApproveCount).toBe(0);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] asks the personal knowledge base with citations from the workspace', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await sendComposerMessage(
      page,
      'Ask my knowledge base how knowledge answers stay grounded in citations.',
    );

    const answerPanel = page.getByTestId('knowledge-answer-panel');
    await expect(answerPanel).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(answerPanel).toContainText(/Grounded answers cite repository excerpts/i);
    await expect(answerPanel).toContainText(/MemoFlow grounding policy/i);
    await expect(answerPanel).toContainText(/notes\/ai\/grounding-policy\.md/i);
    await expect(page.getByTestId('knowledge-citation-open')).toBeVisible();

    await page.getByTestId('knowledge-citation-open').click();
    await expect(page).toHaveURL(/\/repository\?note=kdoc_550e8400-e29b-41d4-a716-446655440090$/);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] captures a knowledge note through the canonical knowledge.capture Workflow', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await sendComposerMessage(
      page,
      'Capture this conversation as a reusable note about durable Mastra workflow recovery.',
    );

    const native = page.getByTestId('knowledge-capture-native-dialog');
    await expect(native).toBeVisible();
    await expect(page.getByTestId('knowledge-capture-draft-editor')).toHaveCount(0);
    await expect(page.getByTestId('knowledge-capture-agent-confirm-run')).toHaveCount(0);
    await expect(page.getByTestId('knowledge-capture-native-source')).toContainText(
      'owner/knowledge',
    );
    await page.getByTestId('knowledge-capture-native-title').fill('Owner-reviewed durable note');
    await page.getByTestId('knowledge-capture-native-confirm').click();
    await expect(page).toHaveURL(/\/repository\?note=kdoc_550e8400-e29b-41d4-a716-446655440701/i, {
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('knowledge-projection-preview')).toBeVisible();
    expect(telemetry.knowledgeCaptureEvents).toEqual([
      'edit_structured',
      'approve',
      'host_persist',
    ]);
    expect(telemetry.knowledgeCapturePersistedDraft).toMatchObject({
      title: 'Owner-reviewed durable note',
      revision: 2,
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440701',
      source: {
        kind: 'repository',
        connectionId: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440702',
      },
    });
    expect(telemetry.knowledgeCaptureStartCount).toBe(1);
    expect(telemetry.knowledgeCaptureApproveCount).toBe(1);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] cancels native Knowledge review without a note', async ({ page }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    await sendComposerMessage(page, 'Capture this conversation as a reusable note.');
    await expect(page.getByTestId('knowledge-capture-native-dialog')).toBeVisible();
    await page.getByTestId('knowledge-capture-native-cancel').click();
    await expect(page.getByTestId('knowledge-capture-native-dialog')).toHaveCount(0);
    await expect.poll(() => telemetry.knowledgeCaptureCancelCount).toBe(1);
    expect(telemetry.knowledgeCaptureEvents).toEqual([]);
    expect(telemetry.knowledgeCapturePersistedDraft).toBeNull();
    expect(telemetry.knowledgeCaptureApproveCount).toBe(0);
  });

  test('[P0] restores native Knowledge review after refresh', async ({ page }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    await sendComposerMessage(page, 'Capture this conversation as a reusable note.');
    await expect(page.getByTestId('knowledge-capture-native-dialog')).toBeVisible();
    const activeRunId = telemetry.knowledgeCaptureRunId;
    expect(activeRunId).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('knowledge-capture-native-dialog')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId('knowledge-capture-native-title')).toHaveValue(
      'Conversation Agent Checkpoints',
    );
    expect(telemetry.knowledgeCaptureRestoredRunIds).toContain(activeRunId);
    expect(telemetry.knowledgeCaptureRunId).toBe(activeRunId);
    expect(telemetry.knowledgeCaptureStartCount).toBe(1);
    expect(telemetry.knowledgeCapturePersistedDraft).toBeNull();
    await page.getByTestId('knowledge-capture-native-cancel').click();
  });

  test('[P0] shows insufficient evidence when knowledge citations are missing', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);

    await sendComposerMessage(
      page,
      'Ask my knowledge base what it says about the unindexed archive migration plan.',
    );

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

    await sendComposerMessage(
      page,
      'Create a structured AI workflow goal through the Agent runtime and cancel before approving execution.',
    );

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
  ownerTaskCreateCount: number;
  lastOwnerTaskCreateBody: CreateTaskPlanReq | null;
  taskConfirmationEvents: ('owner_create' | 'approve')[];
  ownerGoalCreateCount: number;
  lastOwnerGoalCreateBody: CreateGoalReq | null;
  goalConfirmationEvents: ('owner_create' | 'approve')[];
  goalAgentStartCount: number;
  lastGoalWorkflowOwnerCreate: GoalReviewSuspension['ownerCreate'] | null;
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
  knowledgeCaptureRunId: string | null;
  knowledgeCaptureRestoredRunIds: string[];
  knowledgeCaptureEvents: string[];
  knowledgeCapturePersistedDraft: KnowledgeCaptureMockRun['draft'] | null;
  legacyEndpointCallCount: number;
};

type GoalReviewSuspension = Extract<
  NonNullable<Extract<AIWorkflowRunView, { kind: 'goal.create' }>['suspension']>,
  { type: 'goal_draft_review' }
>;

type GoalWorkflowMockRun = {
  runId: string;
  conversationId: string;
  createdAt: number;
  draft: GoalPlanDraft;
  ownerCreate: GoalReviewSuspension['ownerCreate'];
  /** Durable V2 apply receipt state after approved child mutations. */
  referenceMap: Record<string, string>;
  relationIds: Record<string, string>;
  goalVersion?: number;
  appliedGoalStatus?: 'Planned' | 'InProgress';
  failures: GoalPlanExecutionFailure[];
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
  status: 'suspended' | 'completed' | 'cancelled';
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
      draftRef: 'task:review-mastra-migration',
      schedule: {
        kind: 'Recurring',
        startDate: '2026-09-01',
        timing: { kind: 'At', time: '09:00' },
        recurrence: {
          frequency: 'Weekly',
          interval: 1,
          byWeekday: [1],
          end: { kind: 'Never' },
        },
      },
      reminderConfig: null,
      goalBinding: null,
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
    knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440701',
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

function taskOwnerIdentity(run: TaskWorkflowMockRun): string {
  const bytes = createHash('sha256')
    .update(
      `memoflow:task.create:v2:${run.runId}:${run.draft.revision}:${run.draft.task.draftRef}:task_plan_create`,
      'utf8',
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `ITaskPlanId_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function createTaskReviewRun(mockRun: TaskWorkflowMockRun): AIWorkflowRunView {
  return {
    runId: mockRun.runId,
    kind: 'task.create',
    conversationId: mockRun.conversationId,
    status: 'suspended',
    suspension: {
      type: 'task_draft_review',
      ownerCreate: {
        taskId: CreateTaskPlanSchema.shape.id.unwrap().parse(taskOwnerIdentity(mockRun)),
        draftRef: mockRun.draft.task.draftRef,
      },
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
      referenceMap: { [mockRun.draft.task.draftRef]: taskOwnerIdentity(mockRun) },
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
      noteId: mockRun.draft.knowledgeDocumentId,
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
  return {
    revision: 1,
    goal: {
      draftRef: 'goal',
      name: 'Restored AI Agent workspace',
      summary: 'A pending approval run restored from local workflow state.',
      status: 'Planned',
      start: { kind: 'day', date: '2026-09-12' },
      target: { kind: 'year', year: 2026 },
      labels: [],
    },
    keyResults: [
      {
        draftRef: 'kr:restored-approval',
        title: 'Complete the restored workflow approval',
        description: 'Confirm the pending workflow from the durable run.',
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
    rationale: 'Create the restored Agent goal after user approval.',
    warnings: [],
  };
}

function createPendingApprovalWorkflowEntry() {
  return { activeRunId: 'workflow-e2e-restored-approval' };
}

function createPendingTaskApprovalWorkflowEntry() {
  return { activeRunId: 'workflow-e2e-restored-task-approval' };
}

function createGoalAgentWorkflowDraft(): GoalPlanDraft {
  return {
    revision: 1,
    goal: {
      draftRef: 'goal',
      name: 'Agent-created AI workflow',
      summary: 'Create a structured goal through the Mastra Workflow runtime.',
      status: 'InProgress',
      start: { kind: 'day', date: '2026-09-12' },
      target: { kind: 'quarter', year: 2026, quarter: 4 },
      labels: ['ai-vnext'],
    },
    keyResults: [
      {
        draftRef: 'kr:end-to-end',
        title: 'Run the Goal Agent workflow end to end',
        description: 'Confirm Mastra Workflow execution through the controlled executor.',
        aggregationMethod: 'Sum',
        initialValue: 0,
        currentValue: 0,
        targetValue: 1,
        target: null,
        unit: 'workflow',
        weight: 3,
      },
    ],
    tasks: [
      {
        draftRef: 'task:review-execution',
        title: 'Review Agent execution',
        description: 'Check result and recovery.',
        importance: 'Moderate',
        schedule: {
          kind: 'Recurring',
          startDate: '2026-09-12',
          timing: { kind: 'At', time: '09:00' },
          recurrence: {
            frequency: 'Weekly',
            interval: 1,
            byWeekday: [1],
            end: { kind: 'Never' },
          },
        },
        reminderConfig: null,
        labels: [],
        goalRef: 'goal',
        keyResultRef: 'kr:end-to-end',
        contribution: { value: 1, trigger: 'EachCompletion' },
      },
    ],
    knowledge: [
      {
        draftRef: 'note:goal-brief',
        mode: 'create',
        title: 'Agent Goal Brief',
        markdown: '# Agent Goal Brief\n\nValidated through the durable GoalPlanDraft V2 workflow.',
        targetSubpath: 'goals/agent-goal-brief.md',
        sourceRefs: ['conversation:e2e-goal-workflow'],
      },
    ],
    rationale:
      'Create the approved goal draft with a measurable key result, Knowledge brief, and canonical Task plan.',
    warnings: [],
  };
}

function createOwnerIdentities(
  runId: string,
  draft: GoalPlanDraft,
): GoalReviewSuspension['ownerCreate'] {
  const entityId = (prefix: 'IGoalId' | 'IKeyResultId', draftRef: string) => {
    const hash = createHash('sha256')
      .update(`${runId}:${draft.revision}:${prefix}:${draftRef}`)
      .digest('hex');
    const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return `${prefix}_${uuid}`;
  };
  return {
    goalId: entityId('IGoalId', draft.goal.draftRef),
    keyResultIds: Object.fromEntries(
      draft.keyResults.map((keyResult) => [
        keyResult.draftRef,
        entityId('IKeyResultId', keyResult.draftRef),
      ]),
    ),
  };
}

function createGoalWorkflowMockRun(request: {
  runId?: string;
  conversationId?: string | null;
  draft?: GoalPlanDraft;
}): GoalWorkflowMockRun {
  const runId = request.runId ?? 'workflow-e2e-goal-1';
  const draft = request.draft ?? createGoalAgentWorkflowDraft();
  return {
    runId,
    conversationId: request.conversationId ?? e2eConversationId,
    createdAt: Date.now(),
    draft,
    ownerCreate: createOwnerIdentities(runId, draft),
    referenceMap: {},
    relationIds: {},
    failures: [],
    executionStatus: 'failed',
  };
}

function goalReviewSuspension(mockRun: GoalWorkflowMockRun): GoalReviewSuspension {
  return {
    type: 'goal_draft_review',
    draft: mockRun.draft,
    ownerCreate: mockRun.ownerCreate,
    warnings: mockRun.draft.warnings,
    revision: mockRun.draft.revision,
  };
}

function createGoalReviewRun(mockRun: GoalWorkflowMockRun): AIWorkflowRunView {
  const now = Date.now();
  return AIWorkflowRunViewSchema.parse({
    runId: mockRun.runId,
    kind: 'goal.create',
    conversationId: mockRun.conversationId,
    status: 'suspended',
    suspension: goalReviewSuspension(mockRun),
    createdAt: mockRun.createdAt,
    updatedAt: now,
  });
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
      referenceMap: { ...mockRun.referenceMap },
      relationIds: { ...mockRun.relationIds },
      goalVersion: mockRun.goalVersion,
      appliedGoalStatus: mockRun.appliedGoalStatus,
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
      referenceMap: { ...mockRun.referenceMap },
      relationIds: { ...mockRun.relationIds },
      goalVersion: mockRun.goalVersion,
      appliedGoalStatus: mockRun.appliedGoalStatus,
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

  mockRun.referenceMap = {
    [mockRun.draft.goal.draftRef]: mockRun.ownerCreate.goalId,
    ...mockRun.ownerCreate.keyResultIds,
    'note:goal-brief': 'kdoc_e2e_goal_brief',
    ...(retrySucceeded ? { 'task:review-execution': 'task-plan-e2e-1' } : {}),
  };
  mockRun.relationIds = { 'note:goal-brief': 'relation-e2e-goal-brief' };
  mockRun.goalVersion = 2;
  mockRun.appliedGoalStatus = 'InProgress';
  if (retrySucceeded) {
    mockRun.failures = [];
    mockRun.executionStatus = 'success';
  } else {
    mockRun.failures = [
      {
        operation: 'task_create',
        draftRef: 'task:review-execution',
        code: 'TASK_CREATE_FAILED',
        message: 'Task plan persistence is temporarily unavailable.',
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
    ownerTaskCreateCount: 0,
    lastOwnerTaskCreateBody: null,
    taskConfirmationEvents: [],
    ownerGoalCreateCount: 0,
    lastOwnerGoalCreateBody: null,
    goalConfirmationEvents: [],
    goalAgentStartCount: 0,
    lastGoalWorkflowOwnerCreate: null,
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
    knowledgeCaptureRunId: null,
    knowledgeCaptureRestoredRunIds: [],
    knowledgeCaptureEvents: [],
    knowledgeCapturePersistedDraft: null,
    legacyEndpointCallCount: 0,
  };
  await page.route('**/api/v1/repositories/**', async (route) => {
    if (telemetry.knowledgeCaptureStartCount === 0) {
      await route.fallback();
      return;
    }
    expect(route.request().method()).toBe('GET');
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/knowledge-connections')) {
      await fulfillJson(
        route,
        ListKnowledgeRepositoryConnectionsResSchema.parse({
          connections: [
            {
              id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440702',
              knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440703',
              identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440704',
              provider: 'GitHub',
              installationId: 'installation-e2e',
              repositoryId: 'repository-e2e',
              repositoryFullNameSnapshot: 'owner/knowledge',
              connectedAt: 1,
              disconnectedAt: null,
              observation: {
                bindingId: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440702',
                observedAt: 1,
                accountId: '42',
                repositoryFullName: 'owner/knowledge',
                defaultBranch: 'main',
                private: true,
                archived: false,
                disabled: false,
                contentsPermission: 'write',
                installationSuspended: false,
                eligibility: { state: 'Ready' },
              },
              historyFence: null,
              projectionCheckpoint: null,
            },
          ],
        }),
      );
      return;
    }
    if (pathname.endsWith('/knowledge-notes/resolve') && telemetry.knowledgeCapturePersistedDraft) {
      const draft = telemetry.knowledgeCapturePersistedDraft;
      expect(new URL(route.request().url()).searchParams.get('reference')).toBe(
        draft.knowledgeDocumentId,
      );
      await fulfillJson(
        route,
        KnowledgeNoteProjectionClientSchema.parse({
          id: 'projection-created-note',
          connectionId: draft.source!.kind === 'repository' ? draft.source!.connectionId : '',
          knowledgeDocumentId: draft.knowledgeDocumentId,
          relativePath: `notes/ai/${draft.title}.md`,
          title: draft.title,
          commitSha: 'b'.repeat(40),
          blobSha: 'c'.repeat(40),
          contentHash: 'd'.repeat(64),
          markdownContent: draft.markdown,
          frontmatter: {},
          createdAt: 1,
          updatedAt: 2,
          deletedAt: null,
        }),
      );
      return;
    }
    if (pathname.endsWith('/knowledge-notes/tree')) {
      await fulfillJson(
        route,
        KnowledgeNoteTreeResponseSchema.parse({
          parent: new URL(route.request().url()).searchParams.get('parent') ?? '',
          metadata: null,
          nodes: [],
        }),
      );
      return;
    }
    if (pathname.endsWith('/knowledge-notes')) {
      await fulfillJson(
        route,
        KnowledgeNoteProjectionListResponseSchema.parse({
          notes: [],
          total: 0,
          nextCursor: null,
        }),
      );
      return;
    }
    await route.fallback();
  });
  // Pass-through Task telemetry exercises the real owner API and test database.
  await page.route(
    (url) => url.pathname === '/api/v1/task-plans',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      telemetry.ownerTaskCreateCount += 1;
      telemetry.lastOwnerTaskCreateBody = CreateTaskPlanSchema.parse(
        route.request().postDataJSON(),
      );
      telemetry.taskConfirmationEvents.push('owner_create');
      await route.continue();
    },
  );
  // Observe only native owner create; Goal reads/status/updates remain real API calls.
  await page.route(
    (url) => url.pathname === '/api/v1/goals',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      telemetry.ownerGoalCreateCount += 1;
      telemetry.lastOwnerGoalCreateBody = route.request().postDataJSON() as CreateGoalReq;
      telemetry.goalConfirmationEvents.push('owner_create');
      await route.continue();
    },
  );

  await page.route('**/api/v1/settings/preferences', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await fulfillJson(route, {
      ...createDefaultUserPreferenceProfile(),
      presentation: { theme: 'light', language: 'en-US' },
      regional: {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      },
    });
  });

  await page.route('**/api/v1/ai/providers', async (route) => {
    await fulfillJson(route, {
      data: [
        {
          id: 'provider-e2e-openai',
          identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
          name: 'E2E OpenAI',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          credentialRef: 'credential-e2e',
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
          documentRef: {
            knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091',
            documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
          },
          sourcePath: 'notes/ai/grounding-policy.md',
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
    draft: createRestoredGoalWorkflowDraft(),
  });
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
      const mockRun = createGoalWorkflowMockRun({
        runId: `workflow-e2e-goal-${telemetry.goalAgentStartCount}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conversationId: request.conversationId,
      });
      telemetry.lastGoalWorkflowOwnerCreate = mockRun.ownerCreate;
      workflowRunsByRunId.set(mockRun.runId, mockRun);
      await fulfillJson(route, createGoalReviewRun(mockRun));
      return;
    }

    if (request.kind === 'task.create') {
      expect(request.input?.idea?.trim().length).toBeGreaterThan(0);
      telemetry.taskWorkflowStartCount += 1;
      const mockRun: TaskWorkflowMockRun = {
        runId: `workflow-e2e-task-${telemetry.taskWorkflowStartCount}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        status: 'suspended',
      };
      telemetry.knowledgeCaptureRunId = mockRun.runId;
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
    if (captureRun) telemetry.knowledgeCaptureRestoredRunIds.push(captureRun.runId);
    await fulfillJson(
      route,
      captureRun
        ? captureRun.status === 'completed'
          ? createKnowledgeCaptureCompletedRun(captureRun)
          : captureRun.status === 'cancelled'
            ? createKnowledgeCaptureCancelledRun(captureRun)
            : createKnowledgeCaptureReviewRun(captureRun)
        : null,
    );
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
      command?: { type?: string; patch?: Record<string, unknown> };
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
        expect(telemetry.ownerTaskCreateCount).toBe(1);
        expect(telemetry.lastOwnerTaskCreateBody?.id).toBe(taskOwnerIdentity(taskRun));
        telemetry.taskConfirmationEvents.push('approve');
        telemetry.taskWorkflowApproveCount += 1;
        await fulfillJson(route, createTaskCompletedRun(taskRun));
        return;
      }
      if (commandType === 'edit_structured') {
        const edited = TaskPlanDraftContentSchema.parse(
          (route.request().postDataJSON() as { command: { patch: unknown } }).command.patch,
        );
        taskRun.draft = { ...edited, revision: taskRun.draft.revision + 1 };
        await fulfillJson(route, createTaskReviewRun(taskRun));
        return;
      }
      throw new Error(`Unexpected task.create resume command: ${String(commandType)}`);
    }

    const captureRun = knowledgeCaptureRunsByRunId.get(runId);
    if (captureRun) {
      if (commandType === 'cancel') {
        captureRun.status = 'cancelled';
        telemetry.knowledgeCaptureCancelCount += 1;
        await fulfillJson(route, createKnowledgeCaptureCancelledRun(captureRun));
        return;
      }
      if (commandType === 'approve') {
        expect(captureRun.draft.source).toEqual({
          kind: 'repository',
          connectionId: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440702',
        });
        captureRun.status = 'completed';
        telemetry.knowledgeCaptureEvents.push('approve', 'host_persist');
        telemetry.knowledgeCapturePersistedDraft = captureRun.draft;
        telemetry.knowledgeCaptureApproveCount += 1;
        await fulfillJson(route, createKnowledgeCaptureCompletedRun(captureRun));
        return;
      }
      if (commandType === 'edit_structured') {
        telemetry.knowledgeCaptureEvents.push('edit_structured');
        captureRun.draft = KnowledgeDraftSchema.parse({
          ...captureRun.draft,
          ...(request.command?.patch as Record<string, unknown>),
          revision: captureRun.draft.revision + 1,
        });
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
      const ownerCreateRun = mockRun ?? restoredApprovalRun;
      telemetry.goalConfirmationEvents.push('approve');
      expect(telemetry.ownerGoalCreateCount).toBe(1);
      expect(telemetry.lastOwnerGoalCreateBody?.id).toBe(ownerCreateRun.ownerCreate.goalId);
      expect(telemetry.lastOwnerGoalCreateBody?.initialKeyResults?.map((kr) => kr.id)).toEqual(
        ownerCreateRun.draft.keyResults.map(
          (kr) => ownerCreateRun.ownerCreate.keyResultIds[kr.draftRef],
        ),
      );
      expect(telemetry.goalConfirmationEvents).toEqual(['owner_create', 'approve']);
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
