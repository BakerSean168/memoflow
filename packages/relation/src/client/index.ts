import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { RelationChannels } from '@memoflow/desktop-contracts';
import type { GoalKnowledgeClientPort } from '@memoflow/relation-contracts';

export type { GoalKnowledgeClientPort } from '@memoflow/relation-contracts';

export function createGoalKnowledgeHttpClient(
  httpClient: IResultHttpClient,
): GoalKnowledgeClientPort {
  return {
    linkGoalKnowledge: (request) => httpClient.post('/goal-knowledge', request),
    unlinkGoalKnowledge: (request) => httpClient.delete('/goal-knowledge', { data: request }),
    listGoalKnowledge: ({ goalId }) =>
      httpClient.get(`/goal-knowledge/${encodeURIComponent(goalId)}`),
    listGoalsForKnowledge: (request) => httpClient.post('/goal-knowledge/reverse', request),
  };
}

export function createGoalKnowledgeIpcClient(ipcClient: IResultIpcClient): GoalKnowledgeClientPort {
  return {
    linkGoalKnowledge: (request) => ipcClient.invoke(RelationChannels.GOAL_KNOWLEDGE_LINK, request),
    unlinkGoalKnowledge: (request) =>
      ipcClient.invoke(RelationChannels.GOAL_KNOWLEDGE_UNLINK, request),
    listGoalKnowledge: (request) => ipcClient.invoke(RelationChannels.GOAL_KNOWLEDGE_LIST, request),
    listGoalsForKnowledge: (request) =>
      ipcClient.invoke(RelationChannels.GOAL_KNOWLEDGE_REVERSE_LIST, request),
  };
}
