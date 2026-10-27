import type { CreateGoalReq, GoalStatus } from '@memoflow/goal-contracts';
import type { KnowledgeDocumentId, KnowledgeDocumentRef } from '@memoflow/repository-contracts';
import type { CreateTaskPlanReq } from '@memoflow/task-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { error, ok } from '@memoflow/transport-contracts/result';
import type { IKnowledgeNotePersistencePort } from '../server/application/ports/knowledge-note-persistence.port';
import type { GoalPlanMutationPort } from '../server/mastra/workflows/goal-plan-mutation.port';

/**
 * Owner capabilities used by the GoalPlanDraft V2 workflow binding.
 *
 * AI composes already-owned application capabilities only; it never opens a
 * shared cross-module transaction or imports another module's repositories.
 */
export interface GoalPlanMutationAdapterDeps {
  readonly goal: {
    getGoalAggregate(
      goalId: string,
      identityId: string,
    ): Promise<
      Result<{
        readonly goal: {
          readonly id: string;
          readonly version: number;
          readonly status: GoalStatus;
        };
        readonly keyResults: readonly { readonly id: string }[];
      }>
    >;
    createGoal(
      request: CreateGoalReq,
      context: ExecutionContext,
    ): Promise<
      Result<{
        readonly goalId: string;
        readonly goalVersion: number;
        readonly readModel: { readonly status: GoalStatus };
        readonly affectedEntityIds: { readonly keyResultIds: readonly string[] };
      }>
    >;
    activateGoal(
      goalId: string,
      identityId: string,
      expectedVersion: number,
    ): Promise<Result<{ readonly goalVersion: number }>>;
  };
  readonly task: {
    createTaskPlan(
      request: CreateTaskPlanReq & { identityId: string },
    ): Promise<Result<{ readonly plan: { readonly id: string } }>>;
  };
  readonly labels: {
    resolveNames(identityId: string, names: readonly string[]): Promise<readonly { id: string }[]>;
  };
  readonly knowledgeNotes: IKnowledgeNotePersistencePort;
  readonly knowledgeRefs: {
    resolve(
      identityId: string,
      documentId: KnowledgeDocumentId,
    ): Promise<KnowledgeDocumentRef | null>;
  };
  readonly goalKnowledge: {
    link(
      identityId: string,
      request: { readonly goalId: string; readonly knowledgeDocument: KnowledgeDocumentRef },
    ): Promise<{ readonly relationId: string }>;
  };
}

/** Canonical host binding for the GoalPlanDraft V2 durable workflow. */
export function createGoalPlanMutationAdapter(
  deps: GoalPlanMutationAdapterDeps,
): GoalPlanMutationPort {
  return {
    async readGoal(goalId, context) {
      const result = await deps.goal.getGoalAggregate(goalId, context.identityId);
      if (!result.ok) return result;
      return ok({
        goalId: String(result.data.goal.id),
        goalVersion: result.data.goal.version,
        goalStatus: result.data.goal.status,
        keyResultIds: result.data.keyResults.map((item) => String(item.id)),
      });
    },

    async resolveLabels(names, context) {
      try {
        const labels = await deps.labels.resolveNames(context.identityId, names);
        return ok(labels.map((label) => label.id));
      } catch (cause) {
        return error(
          'AI_LABEL_RESOLUTION_FAILED',
          cause instanceof Error ? cause.message : 'Failed to resolve Shared Labels',
        );
      }
    },

    async createGoal(request, context) {
      const result = await deps.goal.createGoal(request, context);
      if (!result.ok) return result;
      return ok({
        goalId: String(result.data.goalId),
        goalVersion: result.data.goalVersion,
        goalStatus: result.data.readModel.status,
        keyResultIds: result.data.affectedEntityIds.keyResultIds.map(String),
      });
    },

    async activateGoal(goalId, expectedVersion, context) {
      const result = await deps.goal.activateGoal(goalId, context.identityId, expectedVersion);
      if (!result.ok) return result;
      return ok({ goalVersion: result.data.goalVersion });
    },

    async createTaskPlan(request, context) {
      const result = await deps.task.createTaskPlan({
        ...request,
        identityId: context.identityId,
      });
      if (!result.ok) return result;
      return ok({ taskId: String(result.data.plan.id) });
    },

    async createKnowledgeDocument(request, context) {
      try {
        const fileName = request.targetSubpath.split('/').slice(-1)[0] ?? `${request.title}.md`;
        const persisted = await deps.knowledgeNotes.createKnowledgeNote({
          identityId: context.identityId,
          context,
          knowledgeDocumentId: request.knowledgeDocumentId,
          fileName,
          path: request.targetSubpath,
          content: request.markdown,
          proposalId: request.workflowRunId,
          proposalRevision: request.revision,
          requestId: request.requestId,
        });
        if (persisted.note.id !== request.knowledgeDocumentId) {
          return error(
            'INTERNAL_ERROR',
            'Knowledge persistence returned an unexpected deterministic document identity',
          );
        }
        const knowledgeDocument = await deps.knowledgeRefs.resolve(
          context.identityId,
          request.knowledgeDocumentId,
        );
        if (!knowledgeDocument) {
          return error(
            'NOT_FOUND',
            'Confirmed Knowledge document could not be resolved to the current KnowledgeSpace',
          );
        }
        return ok({ knowledgeDocument });
      } catch (cause) {
        return error(
          'INTERNAL_ERROR',
          cause instanceof Error ? cause.message : 'Failed to create confirmed Knowledge document',
        );
      }
    },

    async linkGoalKnowledge(goalId, knowledgeDocument, context) {
      try {
        const linked = await deps.goalKnowledge.link(context.identityId, {
          goalId,
          knowledgeDocument,
        });
        return ok({ relationId: linked.relationId });
      } catch (cause) {
        return error(
          'NOT_FOUND',
          cause instanceof Error ? cause.message : 'Failed to link Goal Knowledge',
        );
      }
    },
  };
}
