import type {
  GoalPlanDraft,
  GoalPlanDraftRef,
  GoalPlanExecutionReceipt,
} from '@memoflow/contracts/ai';
import type { CreateGoalReq } from '@memoflow/contracts/goal';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type { KnowledgeDocumentRef } from '@memoflow/contracts/repository';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { CreateTaskPlanReq } from '@memoflow/contracts/task';

export type GoalMutationResult = {
  goalId: string;
  goalVersion: number;
  keyResultIds: string[];
};

export type GoalActivationMutationResult = { goalVersion: number };
export type TaskPlanMutationResult = { taskId: string };
export type GoalKnowledgeMutationResult = { relationId: string };

export interface GoalPlanKnowledgeCreateMutationRequest {
  readonly workflowRunId: string;
  readonly revision: number;
  readonly draftRef: GoalPlanDraftRef;
  readonly knowledgeDocumentId: KnowledgeDocumentId;
  readonly title: string;
  readonly markdown: string;
  readonly targetSubpath: string;
  readonly sourceRefs: readonly string[];
  readonly requestId: string;
}

/**
 * Narrow host binding consumed by the Mastra goal.create Workflow.
 *
 * AI owns durable orchestration only. The API/Desktop host binds these calls to
 * the already-composed Goal, Task, Knowledge and Shared Relation owner ports;
 * no owner repository or cross-module transaction leaks into the AI package.
 */
export interface GoalPlanMutationPort {
  resolveLabels(names: readonly string[], context: ExecutionContext): Promise<Result<string[]>>;
  createGoal(
    request: CreateGoalReq,
    context: ExecutionContext,
  ): Promise<Result<GoalMutationResult>>;
  activateGoal(
    goalId: string,
    expectedVersion: number,
    context: ExecutionContext,
  ): Promise<Result<GoalActivationMutationResult>>;
  createTaskPlan(
    request: CreateTaskPlanReq,
    context: ExecutionContext,
  ): Promise<Result<TaskPlanMutationResult>>;
  createKnowledgeDocument(
    request: GoalPlanKnowledgeCreateMutationRequest,
    context: ExecutionContext,
  ): Promise<Result<{ knowledgeDocument: KnowledgeDocumentRef }>>;
  linkGoalKnowledge(
    goalId: string,
    knowledgeDocument: KnowledgeDocumentRef,
    context: ExecutionContext,
  ): Promise<Result<GoalKnowledgeMutationResult>>;
}

export interface ApplyGoalPlanInput {
  readonly workflowRunId: string;
  readonly draft: GoalPlanDraft;
  readonly context: ExecutionContext;
  readonly priorReceipt?: GoalPlanExecutionReceipt;
}
