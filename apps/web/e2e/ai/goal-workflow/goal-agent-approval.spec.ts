import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import {
  bootstrapGoalWorkflowSession,
  createPendingApprovalWorkflowEntry,
  e2eConversationId,
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
});
