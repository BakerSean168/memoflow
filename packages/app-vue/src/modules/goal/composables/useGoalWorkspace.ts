import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
  GetGoalWorkspaceReq,
  GoalWorkspaceKnowledgePage,
  GoalWorkspacePageRequest,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPage,
  GoalWorkspaceTaskPageRequest,
} from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

/**
 * Read-only Goal Workspace adapter for Vue surfaces.
 * UI composition belongs to GOAL-7209; this composable only exposes the 7207
 * read model and bounded Task/Knowledge page queries.
 */
export function useGoalWorkspace(goalId: MaybeRefOrGetter<string | null>) {
  const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const workspace = ref<GoalWorkspaceReadModel | null>(null);
  const taskPage = ref<GoalWorkspaceTaskPage | null>(null);
  const knowledgePage = ref<GoalWorkspaceKnowledgePage | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function loadWorkspace(request?: GetGoalWorkspaceReq) {
    const id = toValue(goalId);
    if (!id) {
      workspace.value = null;
      error.value = null;
      return null;
    }
    isLoading.value = true;
    error.value = null;
    try {
      const result = await service.getGoalWorkspace(id, request);
      if (!result.ok) {
        workspace.value = null;
        error.value = presentErrorMessage(result.error);
        return null;
      }
      workspace.value = result.data;
      return result.data;
    } finally {
      isLoading.value = false;
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
      taskPage.value = null;
      knowledgePage.value = null;
      if (!id) {
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
    refresh: loadWorkspace,
    loadTaskPage,
    loadKnowledgePage,
  };
}
