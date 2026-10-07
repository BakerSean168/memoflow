import type { AIWorkflowRunView, KnowledgeDraft } from '@memoflow/contracts/ai';
import { onScopeDispose, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { useKnowledgeNativeSurface } from '../../../layouts/shell/useKnowledgeNativeSurface';
import type {
  KnowledgeCaptureNativeDraft,
  KnowledgeCaptureNativeEditSession,
} from '../../repository/composables/knowledgeCaptureNativeEditSession';
import { nativeDraftFromKnowledgeDraft } from '../../repository/composables/knowledgeCaptureNativeEditSession';
import { getAIErrorMessage } from './error';
import type { UseAIKnowledgeCaptureOptions } from './types';

/** Knowledge native review lifecycle and confirmation coordination. */
export function useKnowledgeNativeReviewCoordinator(input: {
  options: UseAIKnowledgeCaptureOptions;
  knowledgeCaptureRun: Ref<Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }> | null>;
  knowledgeCaptureResuming: Ref<boolean>;
  resume: (
    command: Parameters<UseAIKnowledgeCaptureOptions['workflowRuntime']['resume']>[0]['command'],
  ) => Promise<void>;
  projectRun: (run: AIWorkflowRunView | null, openNative?: boolean) => Promise<void>;
}) {
  const { options, knowledgeCaptureRun, knowledgeCaptureResuming, projectRun, resume } = input;
  const { t } = useI18n();
  const nativeSurface = useKnowledgeNativeSurface();

  let nativeSession: KnowledgeCaptureNativeEditSession | null = null;
  let projectedRunId: string | null = null;
  let projectedRevision: number | null = null;
  let projectionEpoch = 0;
  let nativeProjection: Promise<void> = Promise.resolve();

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

  function project(run: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>): Promise<void> {
    nativeProjection = projectNativeReview(run);
    return nativeProjection;
  }
  return {
    project,
    openKnowledgeNativeReview,
    retireNativeReview,
    confirmKnowledgeCaptureRun,
    cancelKnowledgeCaptureRun,
  };
}
