import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import {
  bootstrapGoalWorkflowSession,
  createPendingTaskApprovalWorkflowEntry,
  e2eConversationId,
} from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
  test('[P0] restores a pending task.create approval run after refresh', async ({ page }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page, {
      conversationId: e2eConversationId,
      modelKey:
        'agent:mastra::AiProviderConfigId_550e8400-e29b-41d4-a716-446655440801::gpt-4.1-mini',
      workflowEntry: createPendingTaskApprovalWorkflowEntry(),
      seedConversation: true,
    });
    const dialog = page.getByTestId('task-plan-dialog');
    await expect(page.getByTestId('task-open-native-review')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('task-workflow-draft-editor')).toHaveCount(0);
    await expect(page.locator('#quick-task-form')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('task-open-native-review')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId('task-open-native-review').click();
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('task-plan-title-input')).toHaveValue(
      'Restored Mastra task workflow',
    );
    expect(telemetry.ownerTaskCreateCount).toBe(0);
    expect(telemetry.taskWorkflowStartCount).toBe(0);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });
});
