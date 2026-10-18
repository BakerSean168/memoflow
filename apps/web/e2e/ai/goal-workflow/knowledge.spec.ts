import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import { bootstrapGoalWorkflowSession, sendComposerMessage } from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
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
});
