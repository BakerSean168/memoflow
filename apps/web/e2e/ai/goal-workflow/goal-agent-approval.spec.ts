import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import {
  bootstrapGoalWorkflowSession,
  createGoalAgentWorkflowDraft,
  createPendingApprovalWorkflowEntry,
  e2eConversationId,
  sendComposerMessage,
} from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
  test('[P0] restores a pending Goal Agent approval run after refresh', async ({ page }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page, {
      conversationId: e2eConversationId,
      modelKey:
        'agent:mastra::AiProviderConfigId_550e8400-e29b-41d4-a716-446655440801::gpt-4.1-mini',
      workflowEntry: createPendingApprovalWorkflowEntry(),
      seedConversation: true,
    });

    // Restore AI state without navigating to the native business review.
    const workflowPanel = page.getByTestId('goal-workflow-panel');
    const goalForm = page.getByTestId('goal-panel-form');
    await expect(workflowPanel).toHaveCount(1);
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(goalForm).toHaveCount(0);
    await expect(page.getByTestId('goal-dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(workflowPanel).toContainText(/suspended/i, {
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(goalForm).toHaveCount(0);
    await expect(page.getByTestId('goal-dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    // #569 removed the context toggle: durable diagnostics are inline with Chat.
    await expect(page.getByTestId('goal-open-native-review')).toBeVisible();
    await page.getByTestId('goal-open-native-review').click();
    await expect(goalForm).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('goal-dialog')).toHaveCount(0);

    await expect(page.getByTestId('goal-name-input')).toHaveValue('Restored AI Agent workspace');
    await expect(goalForm.getByTestId('goal-key-result-draft-row')).toContainText(
      'Complete the restored workflow approval',
    );
    await expect(workflowPanel).toHaveCount(1);
    await expect(workflowPanel).toContainText(/suspended/i);
    await expect(workflowPanel).toContainText(/Restored AI Agent workspace/i);
    await expect(goalForm.getByTestId('save-goal-button')).toBeVisible();
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);
    expect(telemetry.ownerGoalCreateCount).toBe(0);
    expect(telemetry.goalAgentStartCount).toBe(0);
  });

  test('[P0] completes Goal Agent confirmation through the controlled executor and retries failed actions', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    const draft = createGoalAgentWorkflowDraft();

    await sendComposerMessage(
      page,
      'Create a structured AI workflow goal through the Agent runtime and execute the approved plan.',
      'goal-workflow',
    );

    // Unified composer intent detection starts goal.create automatically. ADR-052:
    // goal.create renders in the durable Workflow panel, not a
    // legacy goal-agent-panel.
    const workflowPanel = page.getByTestId('goal-workflow-panel');
    const goalForm = page.getByTestId('goal-panel-form');
    await expect(workflowPanel).toHaveCount(1);
    await expect(workflowPanel).toContainText(/suspended/i);
    const ownerGoalId = telemetry.lastGoalWorkflowOwnerCreate?.goalId;
    expect(ownerGoalId).toBeTruthy();
    await expect(goalForm).toBeVisible();
    await expect(page.getByTestId('goal-dialog')).toHaveCount(0);
    await expect(page.getByTestId('goal-workflow-draft-editor')).toHaveCount(0);
    await expect(page.getByTestId('goal-agent-confirm-run')).toHaveCount(0);
    await expect(page.getByTestId('goal-name-input')).toHaveValue(draft.goal.name);
    await expect(goalForm.getByTestId('goal-key-result-draft-row')).toContainText(
      draft.keyResults[0].title,
    );
    await expect(workflowPanel).toContainText(/Agent-created AI workflow/i);
    await expect(workflowPanel).toContainText(/Run the Goal Agent workflow end to end/i);
    // Goal/KR editing stays native; supporting Task/Knowledge overlays remain in the workflow.
    await expect(workflowPanel).toContainText(
      /Create the approved goal draft with a measurable key result/i,
    );
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    // Owner-native controlled confirmation: native Save delegates through the workflow
    // coordinator; it is not an independent direct create.
    await goalForm.getByTestId('save-goal-button').click();
    await expect(goalForm).toBeHidden({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    // Native Goal creation returns to Goals. Recovery is visible in the inline
    // Chat diagnostics without resurrecting the retired context sidebar.
    await expect(page.getByTestId('ai-context-panel')).toHaveCount(0);

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
    expect(telemetry.lastGoalAgentStart?.providerId).toBe(
      'AiProviderConfigId_550e8400-e29b-41d4-a716-446655440801',
    );
    expect(telemetry.lastGoalAgentStart?.model).toBe('gpt-4.1-mini');
    expect(telemetry.ownerGoalCreateCount).toBe(1);
    expect(telemetry.goalConfirmationEvents).toEqual(['owner_create', 'approve']);
    expect(telemetry.goalAgentApprovalResumeCount).toBe(1);
    expect(telemetry.goalAgentExecuteRequestCount).toBe(1);

    // Recovery controls remain in Chat's inline workflow diagnostics; the
    // retired Composer-top action bar does not duplicate them.
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
      'goal-workflow',
    );

    const workflowPanel = page.getByTestId('goal-workflow-panel');
    // #569 projects workflow diagnostics inline. The native Goal editor
    // remains the sole owner of saving/cancelling the draft.
    await expect(workflowPanel).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('goal-open-native-review')).toBeVisible();
    await expect(page.getByTestId('goal-agent-confirm-run')).toHaveCount(0);
    await expect(page.getByTestId('goal-agent-cancel-run')).toHaveCount(0);
    await expect(page.getByTestId('goal-agent-panel')).toHaveCount(0);

    // Native Goal review is the owner UI. Confirming its user cancel coordinates the
    // durable workflow cancel directly; no second hidden-panel cancellation is needed.
    const nativeReview = page.getByTestId('goal-panel-form');
    await expect(page.getByTestId('goal-dialog')).toHaveCount(0);
    await expect(nativeReview).toBeVisible();
    // The AI-owned Goal review is modeless: conversations can still be composed.
    const composer = page.getByTestId('ai-chat-composer');
    await expect(composer).toBeEnabled();
    await composer.fill('Additional context while the Goal editor remains open');
    await expect(nativeReview).toBeVisible();
    await nativeReview.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(page.getByTestId('global-confirm-dialog')).toBeVisible();
    await page.getByTestId('global-confirm-confirm').click();
    await expect(nativeReview).toBeHidden();
    await expect.poll(() => telemetry.goalAgentCancelCount).toBe(1);

    await expect(page.getByTestId('goal-agent-confirm-run')).toHaveCount(0);
    await expect(page.getByTestId('goal-agent-cancel-run')).toHaveCount(0);
    // Cancellation is confirmed by durable runtime telemetry, independently
    // of the visible inline diagnostic panel and the native owner form.
    expect(telemetry.goalAgentStartCount).toBe(1);
    expect(telemetry.lastGoalAgentStart?.idea ?? '').toMatch(/Agent runtime/i);
    expect(telemetry.lastGoalAgentStart?.providerId).toBe(
      'AiProviderConfigId_550e8400-e29b-41d4-a716-446655440801',
    );
    expect(telemetry.lastGoalAgentStart?.model).toBe('gpt-4.1-mini');
    expect(telemetry.goalAgentCancelCount).toBe(1);
    expect(telemetry.goalAgentApprovalResumeCount).toBe(0);
  });
});
