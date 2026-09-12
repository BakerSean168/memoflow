import type { KnowledgeDocumentId, KnowledgeSpaceId } from '@memoflow/contracts/primitives';
import type { GoalKnowledgeEdgeListReq, GoalKnowledgeEdgePage } from '@memoflow/contracts/relation';
import type {
  TaskGoalContextPage,
  TaskGoalContextPageRequest,
  TaskGoalContextSummary,
} from '@memoflow/contracts/task';

/** Structural consumer port implemented by the Task owner at host composition. */
export interface GoalWorkspaceTaskContextReadPort {
  listTasksByGoal(
    identityId: string,
    goalId: string,
    page?: TaskGoalContextPageRequest,
  ): Promise<TaskGoalContextPage>;
  listTasksByKeyResult(
    identityId: string,
    goalId: string,
    keyResultId: string,
    page?: TaskGoalContextPageRequest,
  ): Promise<TaskGoalContextPage>;
  getTaskGoalContextSummary(identityId: string, goalId: string): Promise<TaskGoalContextSummary>;
}

/** Typed Relation-owner edge reader. Generic SubjectRef/RelationType never leaks into Goal Workspace. */
export interface GoalWorkspaceKnowledgeRelationReadPort {
  listEdgeRefsForGoal(
    identityId: string,
    request: GoalKnowledgeEdgeListReq,
  ): Promise<GoalKnowledgeEdgePage>;
}

/** Current display projection for one stable ADR-090 knowledge document identity. */
export interface GoalWorkspaceKnowledgeProjection {
  readonly knowledgeSpaceId: KnowledgeSpaceId;
  readonly title: string;
  readonly excerpt: string;
  readonly relativePath: string;
  readonly updatedAt: number;
}

/** Repository/Local-Vault owner resolver injected by the host. Null means a durable edge is unresolved/missing. */
export interface GoalWorkspaceKnowledgeContextReadPort {
  resolveForWorkspace(
    identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<GoalWorkspaceKnowledgeProjection | null>;
}
