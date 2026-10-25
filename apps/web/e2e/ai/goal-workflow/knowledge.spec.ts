import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import { bootstrapGoalWorkflowSession, sendComposerMessage } from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
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
    // The business route restores its empty form; AI history does not populate it.
    await expect.poll(() => telemetry.knowledgeCaptureRestoredRunIds).toContain(activeRunId);
    await expect(page.getByTestId('knowledge-capture-native-title')).toHaveValue('');
    await page.getByTestId('knowledge-capture-native-cancel').click();
    await expect(page.getByTestId('knowledge-capture-native-dialog')).toHaveCount(0);
    expect(telemetry.knowledgeCaptureCancelCount).toBe(0);
    await page.getByTestId('knowledge-capture-open-native-review').click();
    await expect(page.getByTestId('knowledge-capture-native-dialog')).toBeVisible();
    await expect(page.getByTestId('knowledge-capture-native-title')).toHaveValue(
      'Conversation Agent Checkpoints',
    );
    expect(telemetry.knowledgeCaptureRestoredRunIds).toContain(activeRunId);
    expect(telemetry.knowledgeCaptureRunId).toBe(activeRunId);
    expect(telemetry.knowledgeCaptureStartCount).toBe(1);
    expect(telemetry.knowledgeCapturePersistedDraft).toBeNull();
    await page.getByTestId('knowledge-capture-native-cancel').click();
  });
});
