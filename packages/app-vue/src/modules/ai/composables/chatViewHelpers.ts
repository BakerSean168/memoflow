/**
 * Chat view helper functions.
 *
 * Extracted from useAIChatView.ts to reduce composable size.
 */

import type { AIChatService, WorkflowMode, GoalWorkflowStage } from './types';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import type { IWorkflowRuntimeService } from '../../../di/types';
import { unwrap } from '@memoflow/contracts/result';
import { translateResultError } from '../../../shared/utils/translate-result-error';

export type AIWorkflowRestoreErrorCode =
  | 'AI_WORKFLOW_RUNTIME_UNAVAILABLE'
  | 'AI_WORKFLOW_RUN_NOT_FOUND'
  | 'AI_WORKFLOW_CONVERSATION_MISMATCH';

/** A restore failure is explicit so callers cannot accidentally use a stale snapshot. */
export class AIWorkflowRestoreError extends Error {
  constructor(
    readonly code: AIWorkflowRestoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AIWorkflowRestoreError';
  }
}

/**
 * Resolve a persisted run pointer through the authoritative runtime. The
 * local pointer is never treated as a workflow snapshot or fallback source.
 */
export async function loadAuthoritativeWorkflowRun(
  workflowRuntime: IWorkflowRuntimeService,
  conversationId: string,
  runId: string,
): Promise<AIWorkflowRunView> {
  let run: AIWorkflowRunView | null;
  try {
    run = await workflowRuntime.get({ runId });
  } catch {
    throw new AIWorkflowRestoreError(
      'AI_WORKFLOW_RUNTIME_UNAVAILABLE',
      `Workflow runtime unavailable while restoring ${runId}`,
    );
  }
  if (!run) {
    throw new AIWorkflowRestoreError(
      'AI_WORKFLOW_RUN_NOT_FOUND',
      `Workflow run ${runId} is not available for restore`,
    );
  }
  if (run.conversationId !== conversationId) {
    throw new AIWorkflowRestoreError(
      'AI_WORKFLOW_CONVERSATION_MISMATCH',
      `Workflow run ${runId} does not belong to conversation ${conversationId}`,
    );
  }
  return run;
}

/** Parameters for workflowStatusText computation. */
export interface WorkflowStatusParams {
  toolMode: WorkflowMode;
  goalDraftLoading: boolean;
  goalWorkflowStage: GoalWorkflowStage;
  automationLoading: boolean;
  automationExecuting: boolean;
  goalExecutionSummary: { status: string } | null;
  knowledgeQueryLoading: boolean;
  knowledgeAnswer: { evidenceStatus: 'grounded' | 'insufficient' } | null;
  taskAgentLoading?: boolean;
  taskWorkflowRun?: { status: string; suspension?: { type: string } | null } | null;
  knowledgeCaptureLoading?: boolean;
  knowledgeCaptureRun?: { status: string; suspension?: { type: string } | null } | null;
}

/** Computes the workflow status text for the chat view. */
export function getWorkflowStatusText(
  params: WorkflowStatusParams,
  t: (key: string, args?: Record<string, unknown>) => string,
  formatExecutionOutcome: (status: 'success' | 'partial' | 'failed') => string,
): string {
  if (params.toolMode === 'goal-create') {
    if (params.goalDraftLoading) return t('aiAssistant.dialogs.generateGoal.generating');
    if (params.goalWorkflowStage === 'plan' || params.automationLoading)
      return t('aiAssistant.dialogs.automation.planning');
    if (params.goalWorkflowStage === 'execute' || params.automationExecuting)
      return t('aiAssistant.dialogs.automation.executing');
    if (params.goalWorkflowStage === 'confirm')
      return t('aiAssistant.dialogs.automation.awaitingConfirmation');
    if (params.goalWorkflowStage === 'result') {
      if (params.goalExecutionSummary?.status === 'partial')
        return formatExecutionOutcome('partial');
      if (params.goalExecutionSummary?.status === 'failed')
        return formatExecutionOutcome('failed');
      return t('aiAssistant.dialogs.automation.executionRecorded');
    }
    if (params.goalWorkflowStage === 'clarification')
      return t('aiAssistant.chatPage.workflow.goalClarificationHint');
    if (params.goalWorkflowStage === 'draft')
      return t('aiAssistant.chatPage.workflow.goalDraftReadyHint');
    return t('aiAssistant.chatPage.workflow.goalCollectingHint');
  }
  if (params.toolMode === 'task-create') {
    if (params.taskAgentLoading) return t('aiAssistant.dialogs.agent.starting');
    if (params.taskWorkflowRun?.status === 'suspended') {
      return params.taskWorkflowRun.suspension?.type === 'clarification_required'
        ? t('aiAssistant.chatPage.workflow.goalClarificationHint')
        : t('aiAssistant.chatPage.workflow.taskAwaitingApprovalHint');
    }
    if (params.taskWorkflowRun?.status === 'completed') return t('aiAssistant.dialogs.automation.executionRecorded');
    return t('aiAssistant.chatPage.workflow.taskCollectingHint');
  }
  if (params.toolMode === 'knowledge-capture') {
    if (params.knowledgeCaptureLoading) return t('aiAssistant.dialogs.agent.starting');
    if (params.knowledgeCaptureRun?.status === 'suspended') {
      return params.knowledgeCaptureRun.suspension?.type === 'clarification_required'
        ? t('aiAssistant.chatPage.workflow.goalClarificationHint')
        : t('aiAssistant.chatPage.workflow.noteDraftReadyHint');
    }
    if (params.knowledgeCaptureRun?.status === 'completed') return t('aiAssistant.dialogs.automation.executionRecorded');
    return t('aiAssistant.chatPage.workflow.knowledgeCaptureCollectingHint');
  }
  if (params.toolMode === 'knowledge-qa') {
    if (params.knowledgeQueryLoading) return t('aiAssistant.dialogs.knowledge.searching');
    if (params.knowledgeAnswer?.evidenceStatus === 'grounded')
      return t('aiAssistant.dialogs.knowledge.grounded');
    if (params.knowledgeAnswer?.evidenceStatus === 'insufficient')
      return t('aiAssistant.dialogs.knowledge.insufficientEvidence');
    return t('aiAssistant.chatPage.workflow.knowledgeQaCollectingHint');
  }
  return '';
}

/** Parameters for the onMounted initialization. */
export interface ChatViewInitContext {
  initRepository: () => Promise<unknown> | unknown;
  loadProviders: () => Promise<unknown>;
  loadConversationList: () => Promise<unknown>;
  syncSelectedModel: (key?: string) => void;
  getPersistedModelKey: () => string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectConversation: (item: any) => Promise<void>;
  resetChatSession: (mode: string, getDefaultName: (mode: string) => string) => void;
  getDefaultConversationName: (mode: string) => string;
  lastActiveConversationId: { value: string };
  conversationList: { value: Array<{ id: string }> };
  adjustComposerHeight: () => void;
  toastError: (msg: string) => void;
  translate: (key: string) => string;
  nextTick: () => Promise<void>;
}

/** Adjusts the composer textarea height based on content. */
export function adjustComposerHeight(
  getComposerTextarea: () => HTMLTextAreaElement | null,
): void {
  const textarea = getComposerTextarea();
  if (!textarea) return;
  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const borderWidth =
    Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
  const minHeight = lineHeight * 2 + verticalPadding + borderWidth;
  const maxHeight = lineHeight * 5 + verticalPadding + borderWidth;
  textarea.style.height = 'auto';
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

/** Renames the current conversation if the name changed. */
export async function maybeRenameConversation(
  name: string,
  currentTitle: string,
  conversationId: string | null,
  service: Pick<AIChatService, 'updateConversation'>,
  reload: () => Promise<void>,
): Promise<void> {
  const nextName = name.trim();
  if (!nextName || nextName === currentTitle) return;
  if (!conversationId) return;
  try {
    unwrap(await service.updateConversation(conversationId, { name: nextName }));
    await reload();
  } catch (error) {
    console.warn('[AIChatView] failed to update conversation title', error);
  }
}

/** Lifecycle hook bindings for the chat view. */
export interface ChatViewLifecycleContext {
  chatMessage: { value: string };
  chatTimeline: { value: Array<{ id: string; content: string }> };
  scrollMessagesToBottom: () => void;
  abortActiveStream: () => void;
  adjustComposerHeight: () => void;
}

/** Binds watchers and lifecycle hooks for the chat view. */
export function bindChatViewLifecycle(
  ctx: ChatViewLifecycleContext,
  hooks: {
    watch: (source: () => unknown, cb: () => void) => void;
    onBeforeUnmount: (cb: () => void) => void;
    nextTick: (cb: () => void) => void;
  },
): void {
  hooks.watch(
    () => ctx.chatMessage.value,
    () => hooks.nextTick(() => ctx.adjustComposerHeight()),
  );
  hooks.watch(
    () => ctx.chatTimeline.value.map((item) => `${item.id}:${item.content.length}`).join('|'),
    () => ctx.scrollMessagesToBottom(),
  );
  hooks.onBeforeUnmount(() => ctx.abortActiveStream());
}

/** Runs the onMounted initialization sequence. */
export async function initializeChatView(ctx: ChatViewInitContext): Promise<void> {
  ctx.resetChatSession('chat', ctx.getDefaultConversationName);
  ctx.lastActiveConversationId.value =
    localStorage.getItem('ai:last-conversation-id') || '';

  try {
    try {
      await ctx.initRepository();
    } catch (error) {
      console.warn('[AIChatView] failed to initialize repository context', error);
    }
    await ctx.loadProviders();
    ctx.syncSelectedModel(ctx.getPersistedModelKey());
    await ctx.loadConversationList();

    const preferredConversation =
      ctx.conversationList.value.find(
        (item) => item.id === ctx.lastActiveConversationId.value,
      ) ||
      ctx.conversationList.value[0] ||
      null;

    if (preferredConversation) {
      await ctx.selectConversation(preferredConversation);
    }
  } catch (error) {
    ctx.toastError(
      translateResultError(error, ctx.translate, {
        fallbackKey: 'common.operationFailed',
      }),
    );
  }

  await ctx.nextTick();
  ctx.adjustComposerHeight();
}
