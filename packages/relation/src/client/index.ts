import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { RelationChannels } from '@memoflow/contracts/electron';
import type {
  GoalKnowledgeLinkReq,
  GoalKnowledgeListReq,
  GoalKnowledgeRelation,
  GoalsForKnowledgeReq,
} from '@memoflow/contracts/relation';
import type { Result } from '@memoflow/contracts/result';

export interface GoalKnowledgeClientPort {
  linkGoalKnowledge(request: GoalKnowledgeLinkReq): Promise<Result<GoalKnowledgeRelation>>;
  unlinkGoalKnowledge(request: GoalKnowledgeLinkReq): Promise<Result<{ unlinked: boolean }>>;
  listGoalKnowledge(request: GoalKnowledgeListReq): Promise<Result<GoalKnowledgeRelation[]>>;
  listGoalsForKnowledge(request: GoalsForKnowledgeReq): Promise<Result<GoalKnowledgeRelation[]>>;
}

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
