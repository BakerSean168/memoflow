import type { GoalPlanMutationPort, IKnowledgeNotePersistencePort } from '@memoflow/ai';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { error, ok } from '@memoflow/contracts/result';
import type { GoalApplicationPort } from '@memoflow/goal';
import type { LabelService } from '@memoflow/label';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { TaskApplicationPort } from '@memoflow/task';

/** Desktop-host binding for the GoalPlanDraft V2 durable workflow. */
export class DesktopGoalPlanMutationAdapter implements GoalPlanMutationPort {
  constructor(
    private readonly goal: GoalApplicationPort,
    private readonly task: TaskApplicationPort,
    private readonly labels: LabelService,
    private readonly knowledgeNotes: IKnowledgeNotePersistencePort,
    private readonly knowledgeRefs: KnowledgeDocumentRefResolver,
    private readonly goalKnowledge: Pick<GoalKnowledgeService, 'link'>,
  ) {}

  async resolveLabels(
    names: readonly string[],
    context: Parameters<GoalPlanMutationPort['resolveLabels']>[1],
  ) {
    try {
      const labels = await this.labels.resolveNames(context.identityId, names);
      return ok(labels.map((label) => label.id));
    } catch (cause) {
      return error(
        'AI_LABEL_RESOLUTION_FAILED',
        cause instanceof Error ? cause.message : 'Failed to resolve Shared Labels',
      );
    }
  }

  async createGoal(
    request: Parameters<GoalPlanMutationPort['createGoal']>[0],
    context: Parameters<GoalPlanMutationPort['createGoal']>[1],
  ) {
    const result = await this.goal.createGoal(request, context);
    if (!result.ok) return result;
    return ok({
      goalId: String(result.data.goalId),
      goalVersion: result.data.goalVersion,
      keyResultIds: result.data.affectedEntityIds.keyResultIds.map(String),
    });
  }

  async activateGoal(
    goalId: string,
    expectedVersion: number,
    context: Parameters<GoalPlanMutationPort['activateGoal']>[2],
  ) {
    const result = await this.goal.activateGoal(goalId, context.identityId, expectedVersion);
    if (!result.ok) return result;
    return ok({ goalVersion: result.data.goalVersion });
  }

  async createTaskPlan(
    request: Parameters<GoalPlanMutationPort['createTaskPlan']>[0],
    context: Parameters<GoalPlanMutationPort['createTaskPlan']>[1],
  ) {
    const result = await this.task.createTaskPlan({
      ...request,
      identityId: context.identityId as IdentityId,
    });
    if (!result.ok) return result;
    return ok({ taskId: String(result.data.template.id) });
  }

  async createKnowledgeDocument(
    request: Parameters<GoalPlanMutationPort['createKnowledgeDocument']>[0],
    context: Parameters<GoalPlanMutationPort['createKnowledgeDocument']>[1],
  ) {
    try {
      const fileName = request.targetSubpath.split('/').slice(-1)[0] ?? `${request.title}.md`;
      const persisted = await this.knowledgeNotes.createKnowledgeNote({
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
      const knowledgeDocument = await this.knowledgeRefs.resolve(
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
  }

  async linkGoalKnowledge(
    goalId: string,
    knowledgeDocument: Parameters<GoalPlanMutationPort['linkGoalKnowledge']>[1],
    context: Parameters<GoalPlanMutationPort['linkGoalKnowledge']>[2],
  ) {
    try {
      const linked = await this.goalKnowledge.link(context.identityId, {
        goalId: goalId as never,
        knowledgeDocument,
      });
      return ok({ relationId: linked.relationId });
    } catch (cause) {
      return error(
        'NOT_FOUND',
        cause instanceof Error ? cause.message : 'Failed to link Goal Knowledge',
      );
    }
  }
}
