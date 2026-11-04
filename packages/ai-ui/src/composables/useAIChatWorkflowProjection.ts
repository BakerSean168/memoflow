import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type { Ref } from 'vue';
import type { AIWorkflowRunView } from '@memoflow/ai-contracts';
import type { IWorkflowRuntimeService } from '../ai-ui-host';
import { useAIWorkflowReconciliation } from './useAIWorkflowReconciliation';
import { AIWorkflowRestoreError, loadAuthoritativeWorkflowRun } from './chatViewHelpers';
import type { useAIChatSession } from './useAIChatSession';
import type { useAIGoalWorkflow } from './useAIGoalWorkflow';
import type { useAITaskWorkflow } from './useAITaskWorkflow';
import type { useAIKnowledgeCapture } from './useAIKnowledgeCapture';
import type { useAIWorkflowPersistence } from './useAIWorkflowPersistence';
import type { WorkflowMode } from './types';

/**
 * Workflow run projection and recovery extracted from useAIChatView.ts to reduce
 * composable size. Restores persisted workflow state onto the workflow composables
 * and reconciles the authoritative runtime run; call and timing semantics stay
 * owner-identical.
 */
export interface UseAIChatWorkflowProjectionOptions {
  workflowRuntime: IWorkflowRuntimeService;
  runtimeChoice: ReturnType<typeof useAIChatSession>['runtimeChoice'];
  toolMode: Ref<WorkflowMode>;
  persistence: ReturnType<typeof useAIWorkflowPersistence>;
  goalWorkflow: ReturnType<typeof useAIGoalWorkflow>;
  taskWorkflow: ReturnType<typeof useAITaskWorkflow>;
  knowledgeCaptureWorkflow: ReturnType<typeof useAIKnowledgeCapture>;
  maybeRenameCurrentConversation: (name: string) => Promise<void>;
}

export function useAIChatWorkflowProjection(options: UseAIChatWorkflowProjectionOptions) {
  const { t } = useI18n();
  const {
    workflowRuntime,
    runtimeChoice,
    toolMode,
    persistence,
    goalWorkflow,
    taskWorkflow,
    knowledgeCaptureWorkflow,
    maybeRenameCurrentConversation,
  } = options;

  async function restoreWorkflowState(conversationId: string) {
    if (runtimeChoice.value.runtimeKind === 'local_agent') return;
    const persisted = persistence.restoreWorkflowState(conversationId);
    if (!persisted) return;

    try {
      const run = await loadAuthoritativeWorkflowRun(
        workflowRuntime,
        conversationId,
        persisted.activeRunId,
      );
      switch (run.kind) {
        case 'goal.create':
          toolMode.value = 'goal-create';
          await goalWorkflow.projectRun(run, false);
          break;
        case 'task.create':
          toolMode.value = 'task-create';
          await taskWorkflow.projectRun(run, false);
          break;
        case 'knowledge.capture':
          toolMode.value = 'knowledge-capture';
          await knowledgeCaptureWorkflow.projectRun(run, false);
          break;
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        persistence.clearWorkflowState(conversationId);
        toolMode.value = 'chat';
        return;
      }
      persistence.applyEditorOverlay(persisted.editorOverlay, run);
      // Rebase or discard any stale overlay against the runtime revision.
      persistence.persistWorkflowState(conversationId);
      // History restoration updates only AI projections; native business review is explicit.
    } catch (error) {
      // Runtime failure is an explicit empty/blocked restore. The reset above
      // ensures no stale local run or draft remains visible as authority.
      if (
        error instanceof AIWorkflowRestoreError &&
        error.code !== 'AI_WORKFLOW_RUNTIME_UNAVAILABLE'
      ) {
        persistence.clearWorkflowState(conversationId);
      }
      toast.error(t('aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  function activeWorkflowRun(): AIWorkflowRunView | null {
    if (toolMode.value === 'goal-create') return goalWorkflow.goalWorkflowRun.value;
    if (toolMode.value === 'task-create') return taskWorkflow.taskWorkflowRun.value;
    if (toolMode.value === 'knowledge-capture')
      return knowledgeCaptureWorkflow.knowledgeCaptureRun.value;
    return null;
  }

  async function projectAuthoritativeWorkflowRun(run: AIWorkflowRunView): Promise<void> {
    switch (run.kind) {
      case 'goal.create':
        await goalWorkflow.projectRun(run);
        if (run.suspension?.type === 'goal_draft_review') {
          await maybeRenameCurrentConversation(run.suspension.draft.goal.name);
        }
        return;
      case 'task.create':
        await taskWorkflow.projectRun(run);
        if (run.suspension?.type === 'task_draft_review') {
          await maybeRenameCurrentConversation(run.suspension.draft.task.title);
        }
        return;
      case 'knowledge.capture':
        await knowledgeCaptureWorkflow.projectRun(run);
        if (run.suspension?.type === 'knowledge_draft_review') {
          await maybeRenameCurrentConversation(run.suspension.draft.title);
        }
        return;
    }
  }

  useAIWorkflowReconciliation({
    current: activeWorkflowRun,
    get: (request) => workflowRuntime.get(request),
    project: projectAuthoritativeWorkflowRun,
    stopped: (run, reason) => {
      // Clear only the local projection. Transient failure retains the durable
      // pointer for an explicit restore; confirmed absence retires that pointer.
      if (reason === 'missing') {
        persistence.clearWorkflowState(run.conversationId);
        if (run.kind === 'goal.create') void goalWorkflow.projectRun(null);
        if (run.kind === 'task.create') void taskWorkflow.projectRun(null);
        if (run.kind === 'knowledge.capture') void knowledgeCaptureWorkflow.projectRun(null);
      }
      toast.error(
        t(
          reason === 'missing'
            ? 'aiAssistant.errors.workflowRunUnavailable'
            : 'aiAssistant.errors.workflowReadUnavailable',
        ),
      );
    },
  });

  return { restoreWorkflowState };
}
