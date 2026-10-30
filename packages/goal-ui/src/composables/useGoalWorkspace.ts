import { goalUiHost } from '../goal-ui-host';
import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
  GetGoalWorkspaceReq,
  GoalWorkspaceKnowledgePage,
  GoalWorkspacePageRequest,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPage,
  GoalWorkspaceTaskPageRequest,
} from '@memoflow/goal-workspace-contracts';
import { normalizeResultError, presentErrorMessage } from '@memoflow/http-client';

/**
 * Read-only Goal Workspace adapter for Vue surfaces.
 * UI composition belongs to GOAL-7209; this composable only exposes the 7207
 * read model and bounded Task/Knowledge page queries.
 */
export function useGoalWorkspace(goalId: MaybeRefOrGetter<string | null>) {
  const service = goalUiHost.useStrictInject(goalUiHost.GOAL_SERVICE_KEY, 'GoalService');
  const workspace = ref<GoalWorkspaceReadModel | null>(null);
  const taskPage = ref<GoalWorkspaceTaskPage | null>(null);
  const knowledgePage = ref<GoalWorkspaceKnowledgePage | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const errorKind = ref<'not-found' | 'forbidden' | 'temporary' | null>(null);

  function reportWorkspaceFailure(cause: unknown) {
    const code = normalizeResultError(cause)?.code;
    errorKind.value =
      code === 'NOT_FOUND'
        ? 'not-found'
        : code === 'FORBIDDEN' || code === 'UNAUTHORIZED'
          ? 'forbidden'
          : 'temporary';
    // Retain a previously loaded read model only for recoverable read failures.
    if (errorKind.value !== 'temporary') workspace.value = null;
    error.value = presentErrorMessage(cause);
  }

  let workspaceRequest = 0;

  async function loadWorkspace(request?: GetGoalWorkspaceReq) {
    const requestId = ++workspaceRequest;
    const id = toValue(goalId);
    if (!id) {
      workspace.value = null;
      error.value = null;
      return null;
    }
    isLoading.value = true;
    error.value = null;
    errorKind.value = null;
    try {
      const result = await service.getGoalWorkspace(id, request);
      if (requestId !== workspaceRequest || id !== toValue(goalId)) return null;
      if (!result.ok) {
        reportWorkspaceFailure(result.error);
        return null;
      }
      workspace.value = result.data;
      return result.data;
    } catch (cause) {
      if (requestId === workspaceRequest && id === toValue(goalId)) {
        reportWorkspaceFailure(cause);
      }
      return null;
    } finally {
      if (requestId === workspaceRequest) isLoading.value = false;
    }
  }

  async function loadTaskPage(request?: GoalWorkspaceTaskPageRequest) {
    const id = toValue(goalId);
    if (!id) {
      taskPage.value = null;
      return null;
    }
    const result = await service.getGoalWorkspaceTasks(id, request);
    if (!result.ok) {
      error.value = presentErrorMessage(result.error);
      return null;
    }
    taskPage.value = result.data;
    error.value = null;
    return result.data;
  }

  async function loadKnowledgePage(request?: GoalWorkspacePageRequest) {
    const id = toValue(goalId);
    if (!id) {
      knowledgePage.value = null;
      return null;
    }
    const result = await service.getGoalWorkspaceKnowledge(id, request);
    if (!result.ok) {
      error.value = presentErrorMessage(result.error);
      return null;
    }
    knowledgePage.value = result.data;
    error.value = null;
    return result.data;
  }

  watch(
    () => toValue(goalId),
    (id) => {
      workspace.value = null;
      errorKind.value = null;
      taskPage.value = null;
      knowledgePage.value = null;
      if (!id) {
        workspaceRequest += 1;
        isLoading.value = false;
        workspace.value = null;
        error.value = null;
        return;
      }
      void loadWorkspace();
    },
    { immediate: true },
  );

  return {
    workspace,
    taskPage,
    knowledgePage,
    isLoading,
    error,
    errorKind,
    refresh: loadWorkspace,
    loadTaskPage,
    loadKnowledgePage,
  };
}
