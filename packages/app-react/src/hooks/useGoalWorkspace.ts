import { useCallback, useEffect, useState } from 'react';
import type {
  GetGoalWorkspaceReq,
  GoalWorkspaceKnowledgePage,
  GoalWorkspacePageRequest,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPage,
  GoalWorkspaceTaskPageRequest,
} from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';
import { useAppSession } from './useAppSession';
import { useGoalService } from './useGoalService';

/**
 * Read-only Goal Workspace adapter for React/Mobile surfaces.
 * GOAL-7209 owns the visual layout; this hook only exposes the 7207 read model
 * plus bounded Task/Knowledge page queries.
 */
export function useGoalWorkspace(goalId: string | null) {
  const service = useGoalService();
  const { isRemoteAuthenticated } = useAppSession();
  const [workspace, setWorkspace] = useState<GoalWorkspaceReadModel | null>(null);
  const [taskPage, setTaskPage] = useState<GoalWorkspaceTaskPage | null>(null);
  const [knowledgePage, setKnowledgePage] = useState<GoalWorkspaceKnowledgePage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (request?: GetGoalWorkspaceReq) => {
      if (!isRemoteAuthenticated || !goalId) {
        setWorkspace(null);
        setError(null);
        setIsLoading(false);
        return null;
      }
      setIsLoading(true);
      setError(null);
      const result = await service.getGoalWorkspace(goalId, request);
      setIsLoading(false);
      if (!result.ok) {
        setWorkspace(null);
        setError(presentErrorMessage(result.error));
        return null;
      }
      setWorkspace(result.data);
      return result.data;
    },
    [goalId, isRemoteAuthenticated, service],
  );

  const loadTaskPage = useCallback(
    async (request?: GoalWorkspaceTaskPageRequest) => {
      if (!isRemoteAuthenticated || !goalId) {
        setTaskPage(null);
        return null;
      }
      const result = await service.getGoalWorkspaceTasks(goalId, request);
      if (!result.ok) {
        setError(presentErrorMessage(result.error));
        return null;
      }
      setTaskPage(result.data);
      setError(null);
      return result.data;
    },
    [goalId, isRemoteAuthenticated, service],
  );

  const loadKnowledgePage = useCallback(
    async (request?: GoalWorkspacePageRequest) => {
      if (!isRemoteAuthenticated || !goalId) {
        setKnowledgePage(null);
        return null;
      }
      const result = await service.getGoalWorkspaceKnowledge(goalId, request);
      if (!result.ok) {
        setError(presentErrorMessage(result.error));
        return null;
      }
      setKnowledgePage(result.data);
      setError(null);
      return result.data;
    },
    [goalId, isRemoteAuthenticated, service],
  );

  useEffect(() => {
    setTaskPage(null);
    setKnowledgePage(null);
    void refresh();
  }, [refresh]);

  return {
    workspace,
    taskPage,
    knowledgePage,
    isLoading,
    error,
    refresh,
    loadTaskPage,
    loadKnowledgePage,
  };
}
