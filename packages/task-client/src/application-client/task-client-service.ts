/**
 * Task Client Service
 *
 * Constructor-injected application service for task management.
 * Uses port interfaces directly, returning Result<T> types throughout.
 *
 * @module application-client/task-client-service
 */

import type { Result } from '@memoflow/transport-contracts/result';
import { error, ok, map as mapResult } from '@memoflow/transport-contracts/result';
import { TaskGoalProgressConfigurationSchema } from '@memoflow/task-contracts';
import type {
  CreateTaskPlanReq,
  UpdateTaskPlanReq,
  GenerateOccurrencesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
  SetTaskOccurrenceChecklistItemReq,
  GetTaskOccurrencesByRangeReq,
  TaskOccurrenceClientDTO,
  TaskPlanClientDTO,
} from '@memoflow/task-contracts';
import type { GetTaskWorkspaceReq, TaskPlanWorkspace } from '@memoflow/task-workspace-contracts';
import type { ITaskPlanApiClient, TaskPlanListParams } from './ports/task-plan-api-client.port';
import type { ITaskOccurrenceApiClient } from './ports/task-occurrence-api-client.port';
import type { TaskClientPort } from './task-client.port';

// ===== Canonical DTO normalization =====

/**
 * ADR-069 / GOAL-7205: the only client-side shaping the Task read model applies is
 * goalBinding progress-configuration normalization, identical to the canonical
 * TaskPlanResponseSchema transform. A nullable Key Result link stays `null`; the
 * transport DTO itself is passed through untouched.
 */
function normalizeTaskPlanDTO(dto: TaskPlanClientDTO): TaskPlanClientDTO {
  if (!dto.goalBinding) return dto;
  return {
    ...dto,
    goalBinding: {
      ...dto.goalBinding,
      ...TaskGoalProgressConfigurationSchema.parse(dto.goalBinding),
    },
  };
}

export class TaskClientService implements TaskClientPort {
  constructor(
    private readonly templateApi: ITaskPlanApiClient,
    private readonly instanceApi: ITaskOccurrenceApiClient,
  ) {
    this.getWorkspace = this.getWorkspace.bind(this);
    this.createPlan = this.createPlan.bind(this);
    this.listPlans = this.listPlans.bind(this);
    this.getPlan = this.getPlan.bind(this);
    this.updatePlan = this.updatePlan.bind(this);
    this.deletePlan = this.deletePlan.bind(this);
    this.activatePlan = this.activatePlan.bind(this);
    this.pausePlan = this.pausePlan.bind(this);
    this.archivePlan = this.archivePlan.bind(this);
    this.abandonPlan = this.abandonPlan.bind(this);
    this.generateOccurrences = this.generateOccurrences.bind(this);
    this.getOccurrencesByDateRange = this.getOccurrencesByDateRange.bind(this);
    this.bindToGoal = this.bindToGoal.bind(this);
    this.unbindFromGoal = this.unbindFromGoal.bind(this);
    this.listOccurrences = this.listOccurrences.bind(this);
    this.getOccurrence = this.getOccurrence.bind(this);
    this.deleteOccurrence = this.deleteOccurrence.bind(this);
    this.startOccurrence = this.startOccurrence.bind(this);
    this.completeOccurrence = this.completeOccurrence.bind(this);
    this.skipOccurrence = this.skipOccurrence.bind(this);
    this.markOccurrenceMissed = this.markOccurrenceMissed.bind(this);
    this.rescheduleOccurrence = this.rescheduleOccurrence.bind(this);
    this.setOccurrenceChecklistItem = this.setOccurrenceChecklistItem.bind(this);
  }

  async getWorkspace(
    id: string,
    request?: GetTaskWorkspaceReq,
  ): Promise<Result<TaskPlanWorkspace>> {
    return this.templateApi.getWorkspace(id, request);
  }

  // ===== Task Plan Operations =====

  async createPlan(
    request: CreateTaskPlanReq,
  ): Promise<
    Result<{ plan: TaskPlanClientDTO; occurrenceCount: number; todayOccurrenceCreated: boolean }>
  > {
    const result = await this.templateApi.createTaskPlan(request);
    return mapResult(result, (data) => ({
      plan: normalizeTaskPlanDTO(data.plan),
      occurrenceCount: data.occurrenceCount,
      todayOccurrenceCreated: data.todayOccurrenceCreated,
    }));
  }

  async listPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlanClientDTO[]; total: number }>> {
    const result = await this.templateApi.getTaskPlans(params);
    return mapResult(result, (data) => {
      const plans = data.plans ?? [];
      const total = data.total ?? plans.length;
      return {
        plans: plans.map((dto) => normalizeTaskPlanDTO(dto)),
        total,
      };
    });
  }

  async getPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.getTaskPlanById(id);
    if (!result.ok) return result;
    if (!result.data) return error('NOT_FOUND', 'Task plan not found');
    return ok(normalizeTaskPlanDTO(result.data));
  }

  async updatePlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.updateTaskPlan(id, request);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  async deletePlan(id: string): Promise<Result<void>> {
    return this.templateApi.deleteTaskPlan(id);
  }

  async activatePlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.activateTaskPlan(id);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  async pausePlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.pauseTaskPlan(id);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  async archivePlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.archiveTaskPlan(id);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  async abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.abandonTaskPlan(id, request);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  async generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.templateApi.generateOccurrences(planId, request);
  }

  async getOccurrencesByDateRange(
    planId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.templateApi.getOccurrencesByDateRange(planId, { from, to });
  }

  async bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.bindToGoal(planId, request);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  async unbindFromGoal(planId: string): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.templateApi.unbindFromGoal(planId);
    return mapResult(result, (dto) => normalizeTaskPlanDTO(dto));
  }

  // ===== Task Occurrence Operations =====

  async listOccurrences(params?: {
    page?: number;
    limit?: number;
    planId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const result = await this.instanceApi.getTaskOccurrences(params);
    return mapResult(result, (dtos) => (Array.isArray(dtos) ? dtos : []));
  }

  async listOccurrencesByDateRange(
    from: number,
    to: number,
    options: { includeOverdueOpen?: boolean } = {},
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const request: GetTaskOccurrencesByRangeReq = {
      startDate: from,
      endDate: to,
      includeOverdueOpen: options.includeOverdueOpen ?? false,
    };
    const result = await this.instanceApi.getTaskOccurrencesByDateRange(request);
    return mapResult(result, (dtos) => (Array.isArray(dtos) ? dtos : []));
  }

  async getOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.getTaskOccurrenceById(id);
  }

  async deleteOccurrence(id: string): Promise<Result<void>> {
    return this.instanceApi.deleteTaskOccurrence(id);
  }

  async startOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.startTaskOccurrence(id);
  }

  async completeOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.completeTaskOccurrence(id, request);
  }

  async uncompleteOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.uncompleteTaskOccurrence(id);
  }

  async skipOccurrence(
    id: string,
    request?: SkipTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.skipTaskOccurrence(id, request);
  }

  async markOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.markTaskOccurrenceMissed(id, request);
  }

  async rescheduleOccurrence(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.rescheduleTaskOccurrence(id, request);
  }

  async setOccurrenceChecklistItem(
    id: string,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.instanceApi.setTaskOccurrenceChecklistItem(id, request);
  }
}

// ===== Factory =====

export function createTaskClientService(
  templateApi: ITaskPlanApiClient,
  instanceApi: ITaskOccurrenceApiClient,
): TaskClientService {
  return new TaskClientService(templateApi, instanceApi);
}
