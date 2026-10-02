import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AI-VNEXT-07 workbench integration lock.
 *
 * Detailed runtime behavior is covered by useAIChatSession/useAIGoalWorkflow/
 * useAITaskWorkflow/useAIKnowledgeCapture specs. This suite locks the view-level
 * ownership boundary: AIChatView composes those canonical projections and does
 * not re-introduce a second client workflow engine.
 */
describe('AIChatView Mastra-native workbench', () => {
  const source = readFileSync(resolve(__dirname, 'AIChatView.vue'), 'utf8');
  const viewComposable = readFileSync(
    resolve(__dirname, '../composables/useAIChatView.ts'),
    'utf8',
  );
  const sidebar = readFileSync(
    resolve(__dirname, '../components/AIConversationSidebar.vue'),
    'utf8',
  );
  const actionBar = readFileSync(
    resolve(__dirname, '../components/AIWorkflowActionBar.vue'),
    'utf8',
  );
  const goalPanel = readFileSync(
    resolve(__dirname, '../components/AIGoalWorkflowPanel.vue'),
    'utf8',
  );
  const taskPanel = readFileSync(
    resolve(__dirname, '../components/AITaskWorkflowPanel.vue'),
    'utf8',
  );
  const capturePanel = readFileSync(
    resolve(__dirname, '../components/AIKnowledgeCapturePanel.vue'),
    'utf8',
  );

  it('composes only canonical workflow projections in the right workbench', () => {
    expect(source).toContain('AIGoalWorkflowPanel');
    expect(source).toContain('AITaskWorkflowPanel');
    expect(source).toContain('AIKnowledgeCapturePanel');
    expect(source).toContain(':goal-workflow-run="goalWorkflowRun"');
    expect(source).toContain(':task-workflow-run="taskWorkflowRun"');
    expect(source).toContain(':knowledge-capture-run="knowledgeCaptureRun"');
    expect(source).not.toContain('AIHostProposalPanel');
    expect(source).not.toContain('AIHostExecutionReceiptPanel');
    expect(source).not.toContain('AIHostTimelineArtifactStrip');
  });

  it('does not expose legacy run/proposal ownership in the view or sidebar', () => {
    expect(source).not.toMatch(/\bAgentRun\b/);
    expect(source).not.toContain('hostProposal');
    expect(source).not.toContain('pendingActions');
    expect(source).not.toContain('approvedActions');
    expect(source).not.toContain('dependsOn');
    expect(sidebar).not.toMatch(/\bAgentRun\b/);
    expect(sidebar).not.toContain('agentRuns');
    expect(sidebar).not.toContain('select-agent-run');
  });

  it('keeps open chat on the dedicated Assistant runtime and product shell client', () => {
    expect(viewComposable).toContain('AI_ASSISTANT_RUNTIME_KEY');
    expect(viewComposable).toContain('useAIChatSession');
    expect(viewComposable).toContain('useAIGoalWorkflow');
    expect(viewComposable).toContain('useAITaskWorkflow');
    expect(viewComposable).toContain('useAIKnowledgeCapture');
    expect(viewComposable).not.toContain('dispatchAssistant');
    expect(viewComposable).not.toContain('startAgentRun');
    expect(viewComposable).not.toContain('resumeAgentRun');
  });

  it('auto-routes knowledge queries from the unified composer instead of exposing a manual QA trigger', () => {
    expect(viewComposable).toContain('useAIKnowledgeQaWorkflow');
    expect(source).toContain('inferWorkflowMode(chatMessage.value)');
    expect(source).toContain(
      "else if (inferredMode === 'knowledge-qa') await askKnowledgeFromConversation()",
    );
    expect(source).toContain(':knowledge-answer="knowledgeAnswer"');
    expect(actionBar).not.toContain('data-testid="knowledge-qa-ask"');
    expect(goalPanel).toContain('data-testid="knowledge-answer-panel"');
  });

  it('wires goal/task/knowledge review decisions to typed workflow actions', () => {
    expect(source).toContain('@confirm="confirmTaskAgentRun"');
    expect(source).toContain('@cancel="cancelTaskAgentRun"');
    expect(source).toContain('@retry="retryTaskAgentExecution"');
    expect(source).toContain('@open-native-review="openKnowledgeNativeReview"');
    expect(source).toContain('@submit-clarification="submitKnowledgeClarification"');
    expect(source).toContain('@cancel="cancelKnowledgeCaptureRun"');
    expect(source).toContain('@retry="retryKnowledgeCaptureExecution"');
    expect(taskPanel).toContain('data-testid="task-agent-confirm-run"');
    expect(capturePanel).toContain('data-testid="knowledge-capture-open-native-review"');
    expect(capturePanel).not.toContain('data-testid="knowledge-capture-agent-confirm-run"');
  });

  it('wires completed Task workflow results to the canonical Task detail route', () => {
    expect(viewComposable).toContain('openCreatedTask,');
    expect(viewComposable).toContain('async function openCreatedTask(taskId: string)');
    expect(viewComposable).toContain('await router.push(`/tasks/${taskId}`)');
  });

  it('preserves durable goal HITL and completed-only deep-link behavior', () => {
    expect(goalPanel).toContain("suspension?.type === 'goal_draft_review'");
    expect(goalPanel).toContain("suspension?.type === 'recovery_required'");
    expect(source).toContain("goalWorkflowRun.value?.status !== 'completed'");
    expect(source).toContain('route: `/goals/${automatedGoalId.value}`');
    expect(source).toContain("intent: 'deeplink'");
  });

  it('keeps workflow surface availability owned by the shell integration', () => {
    expect(source).toContain('shellStore?.setWorkflowAvailable(available, itemCount)');
    expect(source).toContain("requestContextPanel('automatic')");
    expect(source).toContain('shellStore.closeWorkflowSurface()');
    expect(source).toContain('SHELL_WORKFLOW_MOUNT_KEY');
  });

  it('projects the currently open goal, task, or registered knowledge note into composer context without a manual mode selector', () => {
    expect(viewComposable).toContain("route.name === 'goal-detail'");
    expect(viewComposable).toContain("entityType: 'goal'");
    expect(viewComposable).toContain("route.name === 'task-detail'");
    expect(viewComposable).toContain("entityType: 'task'");
    expect(viewComposable).toContain("route.name === 'repository'");
    expect(viewComposable).toContain("entityType: 'knowledge_document'");
    expect(viewComposable).toContain('item.knowledgeDocumentId === noteRef');
    expect(viewComposable).toContain('setSurfaceContextEntity');
    expect(viewComposable).toContain('surfaceDescriptorToContextEntity');
    expect(source).toContain('getActiveSurface: () =>');
    expect(source).toContain("shellStore.panelSurface !== 'business'");
    expect(source).not.toContain('ai-chat-tool-menu-trigger');
  });

  it('preserves mobile conversation navigation without runtime-history rows', () => {
    expect(source).toContain('data-testid="ai-mobile-sidebar-toggle"');
    expect(source).toContain('data-testid="ai-mobile-sidebar-panel"');
    expect(source).toContain('@select="selectConversationFromMobile"');
    expect(source).toContain('@select-goal="openRecentGoalFromMobile"');
    expect(source).toContain('@select-knowledge-note="openRecentKnowledgeNoteFromMobile"');
  });

  it('auto-routes knowledge.capture and does not expose workflow-start controls in product UI', () => {
    expect(source).toContain('knowledgeCaptureWorkflow');
    expect(source).toContain(
      "else if (inferredMode === 'knowledge-capture') await startKnowledgeCaptureRun()",
    );
    expect(actionBar).not.toContain('knowledge-capture-agent-start-run');
    expect(actionBar).not.toContain('task-agent-start-run');
    expect(actionBar).not.toContain('goal-agent-start-run');
    expect(source).not.toContain('knowledge-generate');
    expect(actionBar).not.toContain('knowledge-generate');
  });
  it('restores durable Goal/supporting state before independently attempting native projection', () => {
    const projection = viewComposable.indexOf('await goalWorkflow.projectRun(run, false)');
    const overlay = viewComposable.indexOf(
      'persistence.applyEditorOverlay(persisted.editorOverlay, run)',
    );
    const opening = viewComposable.indexOf(
      "if (run.kind === 'goal.create') await goalWorkflow.openGoalNativeReview()",
    );
    expect(projection).toBeGreaterThan(0);
    expect(overlay).toBeGreaterThan(projection);
    expect(opening).toBeGreaterThan(overlay);
    expect(viewComposable).toContain('error instanceof AIWorkflowRestoreError &&');
  });
  it('persists authoritative Task pointer before recoverable native opening and wires native actions', () => {
    const projection = viewComposable.indexOf('await taskWorkflow.projectRun(run, false)');
    const persistence = viewComposable.indexOf(
      'persistence.persistWorkflowState(conversationId)',
      projection,
    );
    const opening = viewComposable.indexOf(
      "if (run.kind === 'task.create') await taskWorkflow.openTaskNativeReview()",
      projection,
    );
    expect(projection).toBeGreaterThan(0);
    expect(persistence).toBeGreaterThan(projection);
    expect(opening).toBeGreaterThan(persistence);
    expect(source).toContain('@open-native-review="openTaskNativeReview"');
    expect(taskPanel).not.toContain('AITaskDraftEditor');
  });
  it('guards Task conversation departure during owner/revision work and uses canonical dirty leave checks', () => {
    expect(viewComposable).toContain(
      'taskWorkflow.taskAgentResuming.value || taskWorkflow.taskOwnerAttemptPending.value',
    );
    expect(viewComposable).toContain('return canLeaveBusinessSurface(t)');
    expect(viewComposable.match(/if \(!canLeaveTaskReview\(\)\) return/g)).toHaveLength(3);
  });
});
