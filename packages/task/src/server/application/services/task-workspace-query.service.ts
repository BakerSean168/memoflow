import { GetTaskWorkspaceReqSchema, TaskPlanWorkspaceSchema, type TaskPlanWorkspace } from '@memoflow/contracts/task';
import { error, ok, type Result } from '@memoflow/contracts/result';
import type { ITaskPlanRepository } from '../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../domain/repositories/i-task-occurrence-repository';
import type { UserTimeContextPort } from '@memoflow/time';
import type { TaskWorkspaceApplicationPort } from '../task-workspace.application.port';
import type { TaskWorkspaceGoalReadPort, TaskWorkspaceKnowledgeContextReadPort, TaskWorkspaceKnowledgeRelationReadPort } from '../ports/task-workspace-read.ports';

export interface TaskWorkspaceQueryServiceDependencies {
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly goalReadPort: TaskWorkspaceGoalReadPort;
  readonly knowledgeRelationReadPort: TaskWorkspaceKnowledgeRelationReadPort;
  readonly knowledgeContextReadPort: TaskWorkspaceKnowledgeContextReadPort;
}

export class TaskWorkspaceQueryService implements TaskWorkspaceApplicationPort {
  constructor(private readonly deps: TaskWorkspaceQueryServiceDependencies) {}
  async getWorkspace(identityId: string, planId: string, request = {}): Promise<Result<TaskPlanWorkspace>> {
    const parsed = GetTaskWorkspaceReqSchema.safeParse(request);
    if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid Task Workspace request');
    const plan = await this.deps.taskPlanRepository.findByIdForIdentity(identityId, planId);
    if (!plan) return error('NOT_FOUND', `Task plan not found: ${planId}`);
    const timeContext = await this.deps.userTimeContextPort.getUserTimeContext(identityId);
    const [counts, recent, goalContext, linkedNotes] = await Promise.all([
      this.deps.taskOccurrenceRepository.getStatusCountsForPlan(planId, identityId),
      this.deps.taskOccurrenceRepository.findRecentByPlan(planId, identityId, parsed.data.recentLimit),
      this.loadGoalContext(identityId, plan.goalBinding),
      this.loadNotes(identityId, planId, parsed.data.recentLimit),
    ]);
    const planDto = plan.toClientDTOAt(timeContext, false, Date.now());
    const total = counts.total;
    return ok(TaskPlanWorkspaceSchema.parse({
      plan: planDto, labels: planDto.labels, goalContext,
      occurrenceSummary: { ...counts, completionRate: total ? Math.round(counts.completed / total * 100) : 0 },
      recentOccurrences: recent.map((occurrence) => occurrence.toClientDTOAt(timeContext, Date.now())),
      linkedNotes,
    }));
  }
  private async loadGoalContext(identityId: string, binding: { goalId: string; keyResultId?: string | null } | null) {
    if (!binding) return null;
    try {
      const result = await this.deps.goalReadPort.getGoal(binding.goalId, identityId, true);
      if (!result.ok) {
        if (result.error.code === 'NOT_FOUND') return { availability: 'Missing' as const, goalId: binding.goalId, keyResultId: binding.keyResultId ?? null, goal: null, keyResult: null };
        return { availability: 'Unavailable' as const, goalId: binding.goalId, keyResultId: binding.keyResultId ?? null, goal: null, keyResult: null };
      }
      if (!result.data) return { availability: 'Missing' as const, goalId: binding.goalId, keyResultId: binding.keyResultId ?? null, goal: null, keyResult: null };
      const keyResult = binding.keyResultId ? result.data.keyResults?.find((item) => String(item.id) === binding.keyResultId) ?? null : null;
      return { availability: 'Available' as const, goalId: binding.goalId, keyResultId: binding.keyResultId ?? null, goal: result.data, keyResult };
    } catch { return { availability: 'Unavailable' as const, goalId: binding.goalId, keyResultId: binding.keyResultId ?? null, goal: null, keyResult: null }; }
  }
  private async loadNotes(identityId: string, planId: string, limit: number) {
    try {
      const page = await this.deps.knowledgeRelationReadPort.listEdgeRefsForTask(identityId, { taskPlanId: planId, limit, offset: 0 });
      return Promise.all(page.items.map(async (edge) => {
        try {
          const projection = await this.deps.knowledgeContextReadPort.resolveForWorkspace(identityId, edge.documentId);
          return projection ? { state: 'Resolved' as const, relationId: edge.relationId, documentId: edge.documentId, linkedAt: edge.createdAt, documentRef: { knowledgeSpaceId: projection.knowledgeSpaceId, documentId: edge.documentId }, title: projection.title, excerpt: projection.excerpt, relativePath: projection.relativePath, updatedAt: projection.updatedAt } : { state: 'Missing' as const, relationId: edge.relationId, documentId: edge.documentId, linkedAt: edge.createdAt, title: null, excerpt: null, relativePath: null, updatedAt: null };
        } catch {
          return { state: 'Missing' as const, relationId: edge.relationId, documentId: edge.documentId, linkedAt: edge.createdAt, title: null, excerpt: null, relativePath: null, updatedAt: null };
        }
      }));
    } catch { return []; }
  }
}
