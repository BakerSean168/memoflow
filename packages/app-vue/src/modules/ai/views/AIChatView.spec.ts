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
  const composer = readFileSync(resolve(__dirname, '../components/AIFooterComposer.vue'), 'utf8');

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

  it('dispatches explicit Goal creation directly to the durable workflow before the generic Assistant path', () => {
    const goalDispatch = source.indexOf("inferredMode === 'goal-create'");
    const prepareTurn = source.indexOf('await prepareWorkflowTurn()', goalDispatch);
    const startGoal = source.indexOf('await startGoalAgentRun(workflowTurn.content)', prepareTurn);
    const directReturn = source.indexOf('return;', startGoal);
    const assistantDispatch = source.indexOf('await handleSendChatBase()', directReturn);
    expect(goalDispatch).toBeGreaterThan(0);
    expect(prepareTurn).toBeGreaterThan(goalDispatch);
    expect(startGoal).toBeGreaterThan(prepareTurn);
    expect(directReturn).toBeGreaterThan(startGoal);
    expect(assistantDispatch).toBeGreaterThan(directReturn);
    expect(source).toContain("if (started === false) toolMode.value = 'chat'");
  });

  it('routes an active Goal clarification reply through the workflow before generic Assistant dispatch', () => {
    const clarificationRoute = source.indexOf('if (goalAgentWaitingForClarification.value)');
    const prepareTurn = source.indexOf('await prepareWorkflowTurn()', clarificationRoute);
    const resume = source.indexOf(
      'await submitGoalClarificationResponse(prepared.content)',
      prepareTurn,
    );
    const directReturn = source.indexOf('return;', resume);
    const assistantDispatch = source.indexOf('await handleSendChatBase()', directReturn);
    expect(clarificationRoute).toBeGreaterThan(0);
    expect(prepareTurn).toBeGreaterThan(clarificationRoute);
    expect(resume).toBeGreaterThan(prepareTurn);
    expect(source).toContain("if (!resumed) toolMode.value = 'chat'");
    expect(directReturn).toBeGreaterThan(resume);
    expect(assistantDispatch).toBeGreaterThan(directReturn);
  });

  it('routes Goal review revision turns through the durable workflow before generic Assistant dispatch', () => {
    const reviewRoute = source.indexOf('if (goalAgentWaitingForApproval.value)');
    const prepareTurn = source.indexOf('await prepareWorkflowTurn()', reviewRoute);
    const revise = source.indexOf(
      'await submitGoalRevisionResponse(prepared.content)',
      prepareTurn,
    );
    const directReturn = source.indexOf('return;', revise);
    const assistantDispatch = source.indexOf('await handleSendChatBase()', directReturn);
    expect(reviewRoute).toBeGreaterThan(0);
    expect(prepareTurn).toBeGreaterThan(reviewRoute);
    expect(revise).toBeGreaterThan(prepareTurn);
    expect(directReturn).toBeGreaterThan(revise);
    expect(assistantDispatch).toBeGreaterThan(directReturn);
  });

  it('auto-routes knowledge queries from the unified composer instead of exposing a manual QA trigger', () => {
    expect(viewComposable).toContain('useAIKnowledgeQaWorkflow');
    expect(source).toContain('inferWorkflowMode(chatMessage.value)');
    expect(source).toContain(
      "else if (inferredMode === 'knowledge-qa') await askKnowledgeFromConversation()",
    );
    expect(source).toContain(':knowledge-answer="knowledgeAnswer"');
    expect(source).not.toContain('data-testid="knowledge-qa-ask"');
    expect(goalPanel).toContain('data-testid="knowledge-answer-panel"');
  });

  it('wires goal/task/knowledge review decisions to typed workflow actions', () => {
    expect(source).toContain('@confirm="confirmTaskAgentRun"');
    expect(source).toContain('@cancel="cancelTaskAgentRun"');
    expect(source).toContain('@retry="retryTaskAgentExecution"');
    expect(source).toContain('@accept-partial="acceptPartialTaskExecution"');
    expect(source).toContain('@cancel-remaining="cancelRemainingTaskExecution"');
    expect(source).toContain('@open-native-review="openKnowledgeNativeReview"');
    expect(source).toContain('taskAgentWaitingForClarification.value');
    expect(source).toContain('submitTaskClarificationResponse(prepared.content)');
    expect(source).toContain('knowledgeCaptureWaitingForClarification.value');
    expect(source).toContain('submitKnowledgeClarificationResponse(prepared.content)');
    expect(source.match(/if \(!resumed\) toolMode\.value = 'chat'/g)).toHaveLength(4);
    expect(source).not.toContain('@submit-clarification="submitKnowledgeClarification"');
    expect(source).not.toContain('@submit-clarification="submitTaskClarification"');
    expect(source).toContain('@cancel="cancelKnowledgeCaptureRun"');
    expect(source).toContain('@retry="retryKnowledgeCaptureExecution"');
    expect(source).toContain('@cancel-remaining="cancelRemainingKnowledgeCaptureExecution"');
    expect(taskPanel).toContain('data-testid="task-agent-confirm-run"');
    expect(taskPanel).toContain('data-testid="task-agent-accept-partial"');
    expect(taskPanel).toContain('data-testid="task-agent-cancel-remaining"');
    expect(capturePanel).toContain('data-testid="knowledge-capture-agent-cancel-remaining"');
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

  it('aligns the chat title bar with the business-panel tab strip height', () => {
    expect(source).toContain('class="flex h-9 shrink-0 items-center border-b');
    expect(source).not.toContain('class="flex h-11 shrink-0 items-center border-b');
  });

  it('keeps workflow intent visible without turning the conversation canvas into a dashboard', () => {
    expect(source).toContain('data-testid="ai-active-intent"');
    expect(source).toContain("toolMode !== 'chat'");
    expect(source).toContain('currentToolLabel');
  });

  it('keeps Goal owner-first while retaining workflow context as an explicit secondary surface', () => {
    expect(source).not.toContain('setWorkflowAvailable(');
    expect(source).toContain(
      "if (available && !wasAvailable && mode !== 'goal-create') requestContextPanel('automatic');",
    );
    expect(source).toContain(
      "if (hasWorkflowContext.value && toolMode.value !== 'goal-create') requestContextPanel('explicit');",
    );
    expect(source).toContain("if (workflow !== 'goal-create') return;");
    expect(source).toContain("requestContextPanel('explicit')");
    expect(source).toContain('data-testid="ai-context-panel-toggle"');
    expect(source).toContain('data-testid="ai-desktop-context-panel-toggle"');
    expect(source).not.toContain('closeWorkflowSurface()');
    expect(source).toContain('<Teleport to="body" :disabled="true">');
    expect(source).toContain('<AIContextPanel');
    expect(source).toContain('<AIGoalWorkflowPanel');
    expect(source).toContain('<AITaskWorkflowPanel');
    expect(source).toContain('<AIKnowledgeCapturePanel');
    expect(goalPanel).toContain("suspension?.type === 'recovery_required'");
    expect(taskPanel).toContain("suspension?.type === 'clarification_required'");
    expect(capturePanel).toContain("suspension?.type === 'clarification_required'");
    expect(source).not.toContain('GoalDialog');
    expect(source).not.toContain('TaskPlanDialog');
    expect(source).not.toContain('KnowledgeCaptureReviewDialog');
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

  it('does not render the retired Composer-top workflow action bar', () => {
    expect(source).not.toContain('AIWorkflowActionBar');
    expect(source).not.toContain('workflow-status-text');
    expect(goalPanel).toContain('data-testid="goal-agent-retry-execution"');
  });

  it('owns one composer mount path with shell teleport and local disabled fallback', () => {
    expect(source.match(/<AIFooterComposer/g)).toHaveLength(1);
    expect(source).toContain(
      '<Teleport :to="shellComposerMount ?? \'body\'" :disabled="!shellComposerMount">',
    );
    expect(source).not.toContain('<Teleport v-if="shellComposerMount"');
    expect(source).not.toMatch(/<AIFooterComposer[\s\S]*?v-else/);
    expect(composer).toContain("semanticElevationClass('floating')");
    expect(composer).not.toContain('rgba(');
    expect(composer).not.toMatch(/shadow-\[[^\]]*rgba/);
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
    expect(source).toContain("else if (inferredMode === 'knowledge-capture') {");
    expect(source).toContain('const started = await startKnowledgeCaptureRun()');
    expect(source).toContain("if (!started) toolMode.value = 'chat'");
    expect(source).not.toContain('knowledge-capture-agent-start-run');
    expect(source).not.toContain('task-agent-start-run');
    expect(source).not.toContain('goal-agent-start-run');
    expect(source).not.toContain('knowledge-generate');
  });
  it('restores durable Goal/supporting state without opening native business review', () => {
    const projection = viewComposable.indexOf('await goalWorkflow.projectRun(run, false)');
    const overlay = viewComposable.indexOf(
      'persistence.applyEditorOverlay(persisted.editorOverlay, run)',
    );
    expect(projection).toBeGreaterThan(0);
    expect(overlay).toBeGreaterThan(projection);
    expect(viewComposable).toContain("run.status === 'failed' || run.status === 'cancelled'");
    expect(viewComposable).toContain('persistence.clearWorkflowState(conversationId)');
    expect(viewComposable).toContain("toolMode.value = 'chat'");
    expect(viewComposable).toContain('error instanceof AIWorkflowRestoreError &&');
  });
  it('persists the restored Task pointer and keeps native review opening explicit', () => {
    const projection = viewComposable.indexOf('await taskWorkflow.projectRun(run, false)');
    const persistence = viewComposable.indexOf(
      'persistence.persistWorkflowState(conversationId)',
      projection,
    );
    expect(projection).toBeGreaterThan(0);
    expect(persistence).toBeGreaterThan(projection);
    expect(source).toContain('@open-native-review="openTaskNativeReview"');
    expect(taskPanel).not.toContain('AITaskDraftEditor');
  });
  it('guards owner conversation departure during owner/revision work and uses canonical dirty leave checks', () => {
    expect(viewComposable).toContain(
      'taskWorkflow.taskAgentResuming.value || taskWorkflow.taskOwnerAttemptPending.value',
    );
    expect(viewComposable).toContain('canLeaveBusinessSurface(t)');
    expect(viewComposable).toContain('goalWorkflow.goalOwnerAttemptPending.value');
    expect(viewComposable).toContain('knowledgeCaptureWorkflow.knowledgeCaptureResuming.value');
    expect(viewComposable.match(/if \(!canLeaveWorkflowReview\(\)\) return/g)).toHaveLength(4);
  });
  it('routes all normal reviews to native owners without retired editor wiring', () => {
    for (const symbol of [
      'AIGoalDraftEditor',
      'AITaskDraftEditor',
      'showGoalDraftEditor',
      'showTaskDraftEditor',
      'toggleGoalDraftEditor',
    ]) {
      expect(source).not.toContain(symbol);
      expect(viewComposable).not.toContain(symbol);
    }
    expect(source).toContain('@open-native-review="openGoalNativeReview"');
    expect(source).toContain('@open-native-review="openTaskNativeReview"');
    expect(source).toContain('@open-native-review="openKnowledgeNativeReview"');
  });
});
