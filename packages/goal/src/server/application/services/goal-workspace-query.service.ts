import {
  GetGoalWorkspaceReqSchema,
  GoalClientDTOSchema,
  GoalWorkspaceKnowledgeItemSchema,
  GoalWorkspaceKnowledgePageSchema,
  GoalWorkspacePageRequestSchema,
  GoalWorkspaceReadModelSchema,
  GoalWorkspaceTaskPageRequestSchema,
  GoalWorkspaceTaskPageSchema,
  type GoalWorkspaceKnowledgeItem,
} from '@memoflow/contracts/goal';
import { error, ok } from '@memoflow/contracts/result';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import { GoalKnowledgeEdgeListReqSchema } from '@memoflow/contracts/relation';
import type { IGoalRecordRepository, IGoalRepository } from '../../domain';
import { ListGoalRecordsUseCase } from '../use-cases/queries/list-goal-records.use-case';
import type { GoalWorkspaceApplicationPort } from '../goal-workspace.application.port';
import type {
  GoalWorkspaceKnowledgeContextReadPort,
  GoalWorkspaceKnowledgeRelationReadPort,
  GoalWorkspaceTaskContextReadPort,
} from '../ports/goal-workspace-read.ports';

export interface GoalWorkspaceQueryServiceDependencies {
  readonly goalRepository: IGoalRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
  readonly taskContextReadPort: GoalWorkspaceTaskContextReadPort;
  readonly knowledgeRelationReadPort: GoalWorkspaceKnowledgeRelationReadPort;
  readonly knowledgeContextReadPort: GoalWorkspaceKnowledgeContextReadPort;
}

/**
 * ADR-069 read composition. Goal/KR remains authoritative in Goal; external
 * Task/Knowledge context is composed only through owner-provided read ports.
 */
export class GoalWorkspaceQueryService implements GoalWorkspaceApplicationPort {
  private readonly records: ListGoalRecordsUseCase;

  constructor(private readonly deps: GoalWorkspaceQueryServiceDependencies) {
    this.records = new ListGoalRecordsUseCase(deps.goalRecordRepository, deps.goalRepository);
  }

  async getWorkspace(identityId: string, goalId: string, request = {}) {
    const parsed = GetGoalWorkspaceReqSchema.safeParse(request);
    if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid Goal Workspace request');

    const goal = await this.deps.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) return error('NOT_FOUND', `Goal not found: ${goalId}`);

    const recordsResult = await this.records.execute({
      identityId,
      goalId,
      limit: parsed.data.recentLimit,
      offset: 0,
    });
    if (!recordsResult.ok) return recordsResult;

    const taskContext = await this.loadTaskContext(identityId, goalId, parsed.data.previewLimit);
    const knowledgeContext = await this.loadKnowledgeContext(
      identityId,
      goalId,
      parsed.data.previewLimit,
    );
    const recentReviews = [...goal.goalReviews]
      .sort((left, right) => Number(right.reviewedAt) - Number(left.reviewedAt))
      .slice(0, parsed.data.recentLimit)
      .map((review) => review.toClientDTO());

    const goalProjection = GoalClientDTOSchema.parse({
      ...goal.toClientDTO(true),
      // recentReviews below owns the review preview in this response; do not
      // duplicate the same authority under goal.reviews.
      reviews: null,
    });

    return ok(
      GoalWorkspaceReadModelSchema.parse({
        goal: goalProjection,
        taskContext,
        knowledgeContext,
        recentProgress: recordsResult.data.data,
        recentReviews,
      }),
    );
  }

  async listTasks(identityId: string, goalId: string, request = {}) {
    const parsed = GoalWorkspaceTaskPageRequestSchema.safeParse(request);
    if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid Goal Workspace task query');
    const goal = await this.deps.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) return error('NOT_FOUND', `Goal not found: ${goalId}`);
    if (
      parsed.data.keyResultId &&
      !goal.keyResults.some((keyResult) => String(keyResult.id) === parsed.data.keyResultId)
    ) {
      return error('NOT_FOUND', `KeyResult not found: ${parsed.data.keyResultId}`);
    }

    try {
      const page = parsed.data.keyResultId
        ? await this.deps.taskContextReadPort.listTasksByKeyResult(
            identityId,
            goalId,
            parsed.data.keyResultId,
            parsed.data,
          )
        : await this.deps.taskContextReadPort.listTasksByGoal(identityId, goalId, parsed.data);
      return ok(GoalWorkspaceTaskPageSchema.parse(page));
    } catch {
      return error('SERVICE_UNAVAILABLE', 'Task context is currently unavailable');
    }
  }

  async listKnowledge(identityId: string, goalId: string, request = {}) {
    const parsed = GoalWorkspacePageRequestSchema.safeParse(request);
    if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid Goal Workspace knowledge query');
    const goal = await this.deps.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: false,
    });
    if (!goal) return error('NOT_FOUND', `Goal not found: ${goalId}`);

    try {
      const edges = await this.deps.knowledgeRelationReadPort.listEdgeRefsForGoal(identityId, {
        goalId: goal.id,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      const items = await Promise.all(
        edges.items.map((edge) => this.projectKnowledgeEdge(identityId, edge)),
      );
      return ok(
        GoalWorkspaceKnowledgePageSchema.parse({
          items,
          total: edges.total,
          limit: edges.limit,
          offset: edges.offset,
        }),
      );
    } catch {
      return error('SERVICE_UNAVAILABLE', 'Knowledge context is currently unavailable');
    }
  }

  private async loadTaskContext(identityId: string, goalId: string, previewLimit: number) {
    try {
      const [summary, preview] = await Promise.all([
        this.deps.taskContextReadPort.getTaskGoalContextSummary(identityId, goalId),
        this.deps.taskContextReadPort.listTasksByGoal(identityId, goalId, {
          limit: previewLimit,
          offset: 0,
        }),
      ]);
      return { availability: 'Available' as const, summary, preview: preview.items };
    } catch {
      return { availability: 'Unavailable' as const, summary: null, preview: [] };
    }
  }

  private async loadKnowledgeContext(identityId: string, goalId: string, previewLimit: number) {
    try {
      const edgeRequest = GoalKnowledgeEdgeListReqSchema.parse({
        goalId,
        limit: previewLimit,
        offset: 0,
      });
      const edges = await this.deps.knowledgeRelationReadPort.listEdgeRefsForGoal(
        identityId,
        edgeRequest,
      );
      const preview = await Promise.all(
        edges.items.map((edge) => this.projectKnowledgeEdge(identityId, edge)),
      );
      return {
        availability: 'Available' as const,
        summary: { total: edges.total },
        preview,
      };
    } catch {
      return { availability: 'Unavailable' as const, summary: null, preview: [] };
    }
  }

  private async projectKnowledgeEdge(
    identityId: string,
    edge: { relationId: string; documentId: KnowledgeDocumentId; createdAt: number },
  ): Promise<GoalWorkspaceKnowledgeItem> {
    const projection = await this.deps.knowledgeContextReadPort.resolveForWorkspace(
      identityId,
      edge.documentId,
    );
    if (!projection) {
      return GoalWorkspaceKnowledgeItemSchema.parse({
        state: 'Missing',
        relationId: edge.relationId,
        documentId: edge.documentId,
        linkedAt: edge.createdAt,
        knowledgeSpaceId: null,
        title: null,
        excerpt: null,
        relativePath: null,
        updatedAt: null,
      });
    }
    return GoalWorkspaceKnowledgeItemSchema.parse({
      state: 'Resolved',
      relationId: edge.relationId,
      documentId: edge.documentId,
      linkedAt: edge.createdAt,
      ...projection,
    });
  }
}
