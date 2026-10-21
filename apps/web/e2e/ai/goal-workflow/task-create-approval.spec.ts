import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import {
  bootstrapGoalWorkflowSession,
  createPendingTaskApprovalWorkflowEntry,
  e2eConversationId,
  sendComposerMessage,
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

  test('[P0] cancels a suspended task.create at approval without creating Task', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page, {
      conversationId: e2eConversationId,
      modelKey:
        'agent:mastra::AiProviderConfigId_550e8400-e29b-41d4-a716-446655440801::gpt-4.1-mini',
      workflowEntry: createPendingTaskApprovalWorkflowEntry(),
      seedConversation: true,
    });
    await expect(page.getByTestId('task-open-native-review')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await page.getByTestId('task-open-native-review').click();
    const dialog = page.getByTestId('task-plan-dialog');
    await expect(dialog).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('global-confirm-dialog')).toBeVisible();
    await page.getByTestId('global-confirm-confirm').click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => telemetry.taskWorkflowCancelCount).toBe(1);
    expect(telemetry.ownerTaskCreateCount).toBe(0);
    expect(telemetry.taskWorkflowApproveCount).toBe(0);
    expect(telemetry.taskWorkflowStartCount).toBe(0);
    expect(telemetry.legacyEndpointCallCount).toBe(0);
  });

  test('[P0] honors an explicit no-create intent without starting task.create', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page);
    await sendComposerMessage(page, 'Draft a task but do not create it until I approve.');
    await expect(page.getByTestId('task-plan-dialog')).toHaveCount(0);
    await expect(page.getByTestId('task-open-native-review')).toHaveCount(0);
    expect(telemetry.taskWorkflowStartCount).toBe(0);
    expect(telemetry.ownerTaskCreateCount).toBe(0);
    expect(telemetry.taskWorkflowApproveCount).toBe(0);
  });
});
