import { computed, onScopeDispose, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type { AIWorkflowRunView, KnowledgeDraft } from '@memoflow/contracts/ai';
import { useKnowledgeNativeSurface } from '../../../layouts/shell/useKnowledgeNativeSurface';
import type {
  KnowledgeCaptureNativeDraft,
  KnowledgeCaptureNativeEditSession,
} from '../../repository/composables/knowledgeCaptureNativeEditSession';
import { nativeDraftFromKnowledgeDraft } from '../../repository/composables/knowledgeCaptureNativeEditSession';
import type { KnowledgeCaptureWorkflowStage, UseAIKnowledgeCaptureOptions } from './types';
import {
  getAIErrorMessage,
  getAIWorkflowFailureMessage,
  getAIWorkflowTerminalFailureMessage,
} from './error';

/**
 * Native Repository projection for the durable knowledge.capture Mastra Workflow.
 *
 * Repository owns the review language and validation. The browser/renderer never writes
 * Knowledge content: after owner review the authoritative draft is reconciled into Mastra,
 * and only workflow approval invokes the host-bound Repository/Local-Vault persistence port.
 */
export function useAIKnowledgeCapture(options: UseAIKnowledgeCaptureOptions) {
  const { t, locale } = useI18n();
  const nativeSurface = useKnowledgeNativeSurface();

  let nativeSession: KnowledgeCaptureNativeEditSession | null = null;
  let projectedRunId: string | null = null;
  let projectedRevision: number | null = null;
  let projectionEpoch = 0;
  let nativeProjection: Promise<void> = Promise.resolve();

  const knowledgeCaptureRun = ref<Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }> | null>(
    null,
  );
  const knowledgeCaptureStage = ref<KnowledgeCaptureWorkflowStage>('collect');
  const knowledgeCaptureLoading = ref(false);
  const knowledgeCaptureResuming = ref(false);

  const reviewDraft = computed(() =>
    knowledgeCaptureRun.value?.suspension?.type === 'knowledge_draft_review'
      ? knowledgeCaptureRun.value.suspension.draft
      : null,
  );

  function retireNativeReview(): void {
    ++projectionEpoch;
    try {
      nativeSession?.setEditingBlocked(false);
      nativeSession?.requestCancel();
    } catch {
      // The Repository owner may already have closed while the route changed.
    }
    nativeSession = null;
    projectedRunId = null;
    projectedRevision = null;
    nativeProjection = Promise.resolve();
  }

  onScopeDispose(retireNativeReview);

  function liveSession(): KnowledgeCaptureNativeEditSession {
    if (!nativeSession || projectedRunId !== knowledgeCaptureRun.value?.runId) {
      throw new Error('Open native Knowledge review before confirming');
    }
    nativeSession.readDraftState();
    return nativeSession;
  }

  async function projectNativeReview(
    run: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>,
  ): Promise<void> {
    const review = run.suspension;
    if (review?.type !== 'knowledge_draft_review') return;

    if (nativeSession && projectedRunId === run.runId) {
      let state: ReturnType<KnowledgeCaptureNativeEditSession['readDraftState']> | null = null;
      try {
        state = nativeSession.readDraftState();
      } catch {
        nativeSession = null;
      }
      if (state && nativeSession) {
        if (projectedRevision === review.revision) {
          const activeSession = await nativeSurface.openCreate();
          if (activeSession === nativeSession) {
            await nativeSession.focus('title');
            return;
          }
          nativeSession = null;
        } else if (state.dirty) {
          throw new Error('Native Knowledge review has unsaved edits for an older revision');
        }
      }
    }

    const epoch = ++projectionEpoch;
    const session = await nativeSurface.openCreate();
    if (epoch !== projectionEpoch) return;

    session.projectDraft(review.draft);
    session.coordinateSubmit(confirmKnowledgeCaptureRun, cancelKnowledgeCaptureRun);
    nativeSession = session;
    projectedRunId = run.runId;
    projectedRevision = review.revision;
    await session.focus('title');
  }

  async function openKnowledgeNativeReview(): Promise<void> {
    const run = knowledgeCaptureRun.value;
    if (!run || run.suspension?.type !== 'knowledge_draft_review') return;
    try {
      nativeProjection = projectNativeReview(run);
      await nativeProjection;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  function projectClarificationToTimeline(
    run: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>,
  ): void {
    const suspension = run.suspension;
    if (suspension?.type !== 'clarification_required') return;
    const id = `knowledge-clarification-${run.runId}-${suspension.round ?? 1}`;
    if ((options.chatTimeline?.value ?? []).some((item) => item.id === id)) return;
    const content = suspension.questions
      .map((question, index) =>
        suspension.questions.length === 1 ? question : `${index + 1}. ${question}`,
      )
      .join('\n');
    options.chatTimeline?.value.push({ id, role: 'assistant', content, status: 'success' });
  }

  function projectFailureToTimeline(
    run: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>,
  ): void {
    if (run.status !== 'failed' || !options.chatTimeline) return;
    const id = `knowledge-capture-workflow-failure-${run.runId}`;
    if (options.chatTimeline.value.some((item) => item.id === id)) return;
    const message = getAIWorkflowTerminalFailureMessage(run.failure, t);
    options.chatTimeline.value.push({
      id,
      role: 'assistant',
      content: message,
      status: 'error',
      errorMessage: message,
    });
  }

  async function projectRun(run: AIWorkflowRunView | null, openNative = true): Promise<void> {
    if (!run || run.kind !== 'knowledge.capture') {
      retireNativeReview();
      knowledgeCaptureRun.value = null;
      knowledgeCaptureStage.value = 'collect';
      return;
    }

    knowledgeCaptureRun.value = run;
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      knowledgeCaptureStage.value = 'clarification';
      projectClarificationToTimeline(run);
    } else if (run.status === 'suspended' && suspension?.type === 'knowledge_draft_review') {
      knowledgeCaptureStage.value = 'confirm';
    } else if (run.status === 'suspended' && suspension?.type === 'recovery_required') {
      retireNativeReview();
      knowledgeCaptureStage.value = 'execute';
    } else if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      knowledgeCaptureStage.value = 'result';
      if (run.status === 'failed') projectFailureToTimeline(run);
      retireNativeReview();
    } else {
      knowledgeCaptureStage.value = 'plan';
    }

    options.scrollMessagesToBottom();
    if (openNative && run.suspension?.type === 'knowledge_draft_review') {
      nativeProjection = projectNativeReview(run);
      await nativeProjection;
    }
  }

  async function syncKnowledgeCaptureRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      await projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  const knowledgeCaptureWaitingForClarification = computed(
    () =>
      knowledgeCaptureRun.value?.status === 'suspended' &&
      knowledgeCaptureRun.value.suspension?.type === 'clarification_required',
  );
  const knowledgeCaptureWaitingForApproval = computed(
    () =>
      knowledgeCaptureRun.value?.status === 'suspended' &&
      knowledgeCaptureRun.value.suspension?.type === 'knowledge_draft_review',
  );
  const knowledgeCaptureWaitingForExecution = computed(
    () =>
      knowledgeCaptureRun.value?.status === 'suspended' &&
      knowledgeCaptureRun.value.suspension?.type === 'recovery_required',
  );
  const canRetryKnowledgeCaptureExecution = computed(() => {
    const suspension = knowledgeCaptureRun.value?.suspension;
    return (
      knowledgeCaptureWaitingForExecution.value &&
      suspension?.type === 'recovery_required' &&
      suspension.retryable &&
      !knowledgeCaptureResuming.value
    );
  });
  const canCancelRemainingKnowledgeCaptureExecution = computed(
    () => knowledgeCaptureWaitingForExecution.value && !knowledgeCaptureResuming.value,
  );
  const canRunKnowledgeCapture = computed(
    () =>
      Boolean(options.selectedModel.value) &&
      Boolean(options.chatConversationId.value) &&
      !options.chatLoading.value &&
      !knowledgeCaptureLoading.value &&
      !knowledgeCaptureResuming.value &&
      options.hasWorkflowUserMessages.value &&
      (!knowledgeCaptureRun.value ||
        ['completed', 'failed', 'cancelled'].includes(knowledgeCaptureRun.value.status)),
  );

  const knowledgeCaptureExecutionSummary = computed(() => {
    const receipt = knowledgeCaptureRun.value?.result;
    return receipt
      ? { status: receipt.status, noteId: receipt.noteId, notePath: receipt.notePath }
      : null;
  });

  const knowledgeCaptureExecutionRecovery = computed(() => {
    const suspension = knowledgeCaptureRun.value?.suspension;
    if (suspension?.type !== 'recovery_required') return null;
    return {
      canRetry: suspension.retryable,
      suggestions: suspension.failures.map((failure) => getAIWorkflowFailureMessage(failure, t)),
    };
  });

  function canonicalNativeDraft(draft: KnowledgeDraft): KnowledgeCaptureNativeDraft {
    return nativeDraftFromKnowledgeDraft(draft);
  }

  async function reconcileOwnerDraft(
    run: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>,
    ownerDraft: KnowledgeCaptureNativeDraft,
  ): Promise<Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>> {
    const review = run.suspension;
    if (review?.type !== 'knowledge_draft_review') return run;
    if (JSON.stringify(ownerDraft) === JSON.stringify(canonicalNativeDraft(review.draft))) {
      return run;
    }

    const next = await options.workflowRuntime.resume({
      runId: run.runId,
      command: {
        type: 'edit_structured',
        patch: {
          title: ownerDraft.title,
          topic: ownerDraft.topic,
          markdown: ownerDraft.markdown,
          targetSubpath: ownerDraft.targetSubpath,
          tags: ownerDraft.tags,
          source: ownerDraft.source,
        },
      },
    });
    await projectRun(next, false);
    if (next.kind !== 'knowledge.capture') {
      throw new Error('Knowledge workflow changed kind during owner reconciliation');
    }
    if (next.suspension?.type === 'knowledge_draft_review') {
      projectedRevision = next.suspension.revision;
    }
    return next;
  }

  async function startKnowledgeCaptureRun(): Promise<boolean> {
    if (!canRunKnowledgeCapture.value || !options.selectedModel.value) return false;
    const topic = options.buildConversationTranscript().trim();
    if (!topic) return false;
    knowledgeCaptureLoading.value = true;
    try {
      const run = await options.workflowRuntime.start({
        kind: 'knowledge.capture',
        conversationId: options.chatConversationId.value,
        input: { topic },
        providerId: options.selectedModel.value.providerId,
        modelId: options.selectedModel.value.modelId,
        locale: locale.value.startsWith('en') ? 'en-US' : 'zh-CN',
      });
      await projectRun(run);
      if (run.kind === 'knowledge.capture' && run.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(run.failure, t));
        return false;
      }
      if (run.kind === 'knowledge.capture' && run.suspension?.type === 'knowledge_draft_review') {
        await options.maybeRenameCurrentConversation(run.suspension.draft.title);
      }
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
    } finally {
      knowledgeCaptureLoading.value = false;
    }
  }

  async function resume(
    command: Parameters<typeof options.workflowRuntime.resume>[0]['command'],
  ): Promise<void> {
    const run = knowledgeCaptureRun.value;
    if (!run || knowledgeCaptureResuming.value) return;
    knowledgeCaptureResuming.value = true;
    try {
      const next = await options.workflowRuntime.resume({ runId: run.runId, command });
      await projectRun(next);
      if (next.kind === 'knowledge.capture' && next.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(next.failure, t));
        return;
      }
      if (next.kind === 'knowledge.capture' && next.status === 'completed' && next.result?.noteId) {
        await options.openCreatedNote?.(next.result.noteId);
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      knowledgeCaptureResuming.value = false;
    }
  }

  async function confirmKnowledgeCaptureRun(): Promise<void> {
    let run = knowledgeCaptureRun.value;
    if (
      !run ||
      run.status !== 'suspended' ||
      run.suspension?.type !== 'knowledge_draft_review' ||
      knowledgeCaptureResuming.value
    ) {
      return;
    }

    knowledgeCaptureResuming.value = true;
    try {
      await nativeProjection;
      const session = liveSession();
      const expectedDraft = session.readDraftState().draft;
      session.setEditingBlocked(true);
      const ownerDraft = await session.requestSubmit({ expectedDraft });
      if (!ownerDraft) {
        session.setEditingBlocked(false);
        return;
      }

      run = await reconcileOwnerDraft(run, ownerDraft);
      if (!(await session.requestSubmit({ expectedDraft }))) return;
      if (run.status !== 'suspended' || run.suspension?.type !== 'knowledge_draft_review') {
        return;
      }

      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'approve' },
      });
      await projectRun(next, false);
      if (next.kind === 'knowledge.capture' && next.status === 'completed' && next.result?.noteId) {
        await options.openCreatedNote?.(next.result.noteId);
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      knowledgeCaptureResuming.value = false;
      try {
        nativeSession?.setEditingBlocked(false);
      } catch {
        // Owner closed after completion/cancellation.
      }
    }
  }

  async function submitKnowledgeClarificationResponse(response: string): Promise<boolean> {
    const run = knowledgeCaptureRun.value;
    const normalized = response.trim();
    if (
      !run ||
      !knowledgeCaptureWaitingForClarification.value ||
      knowledgeCaptureResuming.value ||
      !normalized
    )
      return false;
    knowledgeCaptureResuming.value = true;
    try {
      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'answer', answers: [normalized] },
        workflowTurn: normalized,
      });
      await projectRun(next);
      if (next.kind === 'knowledge.capture' && next.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(next.failure, t));
        return false;
      }
      if (next.kind === 'knowledge.capture' && next.status === 'completed' && next.result?.noteId) {
        await options.openCreatedNote?.(next.result.noteId);
      }
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
    } finally {
      knowledgeCaptureResuming.value = false;
    }
  }
  const retryKnowledgeCaptureExecution = () => resume({ type: 'retry' });
  const cancelRemainingKnowledgeCaptureExecution = () => resume({ type: 'cancel_remaining' });

  async function cancelKnowledgeCaptureRun(): Promise<void> {
    const run = knowledgeCaptureRun.value;
    if (!run || knowledgeCaptureResuming.value) return;
    retireNativeReview();
    if (run.status === 'suspended') {
      await resume({ type: 'cancel' });
      return;
    }

    knowledgeCaptureResuming.value = true;
    try {
      await projectRun(await options.workflowRuntime.cancel({ runId: run.runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      knowledgeCaptureResuming.value = false;
    }
  }

  const completeKnowledgeCaptureRun = confirmKnowledgeCaptureRun;

  function resetKnowledgeCaptureLocalState(): void {
    retireNativeReview();
    knowledgeCaptureRun.value = null;
    knowledgeCaptureStage.value = 'collect';
    knowledgeCaptureLoading.value = false;
    knowledgeCaptureResuming.value = false;
  }

  return {
    knowledgeCaptureRun,
    knowledgeCaptureStage,
    knowledgeCaptureLoading,
    knowledgeCaptureResuming,
    canRunKnowledgeCapture,
    knowledgeCaptureWaitingForApproval,
    knowledgeCaptureWaitingForClarification,
    knowledgeCaptureWaitingForExecution,
    canRetryKnowledgeCaptureExecution,
    canCancelRemainingKnowledgeCaptureExecution,
    knowledgeCaptureExecutionSummary,
    knowledgeCaptureExecutionRecovery,
    reviewDraft,
    startKnowledgeCaptureRun,
    cancelKnowledgeCaptureRun,
    completeKnowledgeCaptureRun,
    retryKnowledgeCaptureExecution,
    cancelRemainingKnowledgeCaptureExecution,
    confirmKnowledgeCaptureRun,
    submitKnowledgeClarificationResponse,
    syncKnowledgeCaptureRun,
    resetKnowledgeCaptureLocalState,
    projectRun,
    openKnowledgeNativeReview,
  };
}
