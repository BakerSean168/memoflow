import type { RelationReadPort, GoalReadPort, TaskReadPort } from '@memoflow/agent-gateway';
import { createRelationNeighborsReader } from '@memoflow/agent-gateway/server';
import type { RelationService } from '@memoflow/relation';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { SubjectRef } from '@memoflow/relation-contracts';
import { KnowledgeDocumentIdSchema } from '@memoflow/repository-contracts';

export interface BindRelationReadPortOptions {
  readonly relationService: Pick<RelationService, 'forward' | 'reverse'>;
  readonly goalKnowledgeService?: Pick<
    GoalKnowledgeService,
    'listForGoal' | 'listGoalsForKnowledge'
  >;
  readonly goals: Pick<GoalReadPort, 'getGoal'>;
  readonly tasks?: Pick<TaskReadPort, 'getTaskPlan'>;
  readonly knowledge?: KnowledgeDocumentRefResolver;
}

/**
 * Binds Relation and cross-domain services to the Gateway RelationReadPort.
 * Visibility policy lives in the shared reader so every host enforces the same
 * "only relations between visible nodes" contract.
 */
export function bindRelationReadPort(options: BindRelationReadPortOptions): RelationReadPort {
  return createRelationNeighborsReader({
    relations: {
      forward: (identityId, node) =>
        options.relationService.forward(identityId, node as SubjectRef),
      reverse: (identityId, node) =>
        options.relationService.reverse(identityId, node as SubjectRef),
    },
    visibility: {
      goal: async (id, context, budget) =>
        (await options.goals.getGoal(id, context, budget)) !== null,
      task: options.tasks
        ? async (id, context, budget) =>
            (await options.tasks!.getTaskPlan(id, context, budget)) !== null
        : undefined,
      note: options.knowledge
        ? async (id, identityId) => {
            const documentId = KnowledgeDocumentIdSchema.safeParse(id);
            if (!documentId.success) return false;
            return (await options.knowledge!.resolve(identityId, documentId.data)) !== null;
          }
        : undefined,
    },
  });
}
