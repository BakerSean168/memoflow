/**
 * Task Client Service
 *
 * Constructor-injected application service for task management.
 * Uses port interfaces directly, returning Result<T> types throughout.
 *
 * @module application-client/task-client-service
 */

import type { Result } from '@memoflow/contracts/result';
import { map as mapResult } from '@memoflow/contracts/result';
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
  TaskReminderConfig,
  TaskGoalBinding,
  TaskGoalBindingDTO,
  GetTaskWorkspaceReq,
  TaskPlanWorkspace,
} from '@memoflow/contracts/task';
import type { ITaskPlanApiClient, TaskPlanListParams } from './ports/task-plan-api-client.port';
import type { ITaskOccurrenceApiClient } from './ports/task-occurrence-api-client.port';
import { TaskPlan } from '../domain-client/aggregates/task-plan';
import { TaskOccurrence } from '../domain-client/aggregates/task-occurrence';

// ===== DTO-to-State Mappers =====

function taskPlanFromDTO(dto: TaskPlanClientDTO): TaskPlan {
  return TaskPlan.load({
    id: dto.id,
    identityId: dto.identityId,
    name: dto.name,
    description: dto.description,
    schedule: structuredClone(dto.schedule),
    reminderConfig: dto.reminderConfig as TaskReminderConfig | null,
    importance: dto.importance,
    goalBinding: dto.goalBinding ? parseGoalBinding(dto.goalBinding) : null,
    checklist: dto.checklist.map((item) => ({ ...item })),
    labels: dto.labels ?? [],
    status: dto.status,
    outcome: dto.outcome,
    completionPolicy: dto.completionPolicy,
    closedAt: dto.closedAt,
    archivedAt: dto.archivedAt,
    abandonedReason: dto.abandonedReason,
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt ? dto.deletedAt : null,
    occurrenceCount: dto.occurrenceCount,
    completedOccurrenceCount: dto.completedOccurrenceCount,
    pendingOccurrenceCount: dto.pendingOccurrenceCount,
    dueOccurrenceCount: dto.dueOccurrenceCount,
    completedDueOccurrenceCount: dto.completedDueOccurrenceCount,
    completionWindowDays: dto.completionWindowDays,
    futurePendingOccurrenceCount: dto.futurePendingOccurrenceCount,
    singleOccurrenceStatus: dto.singleOccurrenceStatus,
    completionRate: dto.completionRate,
    history: dto.history,
  });
}

function taskOccurrenceFromDTO(dto: TaskOccurrenceClientDTO): TaskOccurrence {
  return TaskOccurrence.load(dto);
}

function parseGoalBinding(dto: TaskGoalBindingDTO): TaskGoalBinding {
  return {
    goalId: dto.goalId,
    keyResultId: dto.keyResultId,
    contribution: dto.contribution ? { ...dto.contribution } : null,
  };
}

import type { TaskClientPort } from './task-client.port';

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

  async getWorkspace(id: string, request?: GetTaskWorkspaceReq): Promise<Result<TaskPlanWorkspace>> {
    return this.templateApi.getWorkspace(id, request);
  }

  // ===== Task Plan Operations =====

  async createPlan(
    request: CreateTaskPlanReq,
  ): Promise<Result<{ plan: TaskPlan; occurrenceCount: number; todayOccurrenceCreated: boolean }>> {
    const result = await this.templateApi.createTaskPlan(request);
    return mapResult(result, (data) => ({
      plan: taskPlanFromDTO(data.plan),
      occurrenceCount: data.occurrenceCount,
      todayOccurrenceCreated: data.todayOccurrenceCreated,
    }));
  }

  async listPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlan[]; total: number }>> {
    const result = await this.templateApi.getTaskPlans(params);
    return mapResult(result, (data) => {
      const plans = data.plans ?? [];
      const total = data.total ?? plans.length;
      return {
        plans: plans.map((dto) => taskPlanFromDTO(dto)),
        total,
      };
    });
  }

  async getPlan(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.getTaskPlanById(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async updatePlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.updateTaskPlan(id, request);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async deletePlan(id: string): Promise<Result<void>> {
    return this.templateApi.deleteTaskPlan(id);
  }

  async activatePlan(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.activateTaskPlan(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async pausePlan(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.pauseTaskPlan(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async archivePlan(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.archiveTaskPlan(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.abandonTaskPlan(id, request);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrence[]>> {
    const result = await this.templateApi.generateOccurrences(planId, request);
    return mapResult(result, (dtos) => dtos.map((dto) => taskOccurrenceFromDTO(dto)));
  }

  async getOccurrencesByDateRange(
    planId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskOccurrence[]>> {
    const result = await this.templateApi.getOccurrencesByDateRange(planId, { from, to });
    return mapResult(result, (dtos) => dtos.map((dto) => taskOccurrenceFromDTO(dto)));
  }

  async bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.bindToGoal(planId, request);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async unbindFromGoal(planId: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.unbindFromGoal(planId);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  // ===== Task Occurrence Operations =====

  async listOccurrences(params?: {
    page?: number;
    limit?: number;
    planId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrence[]>> {
    const result = await this.instanceApi.getTaskOccurrences(params);
    return mapResult(result, (dtos) =>
      (Array.isArray(dtos) ? dtos : []).map((dto) => taskOccurrenceFromDTO(dto)),
    );
  }

  async listOccurrencesByDateRange(from: number, to: number): Promise<Result<TaskOccurrence[]>> {
    const request: GetTaskOccurrencesByRangeReq = {
      startDate: from,
      endDate: to,
    };
    const result = await this.instanceApi.getTaskOccurrencesByDateRange(request);
    return mapResult(result, (dtos) =>
      (Array.isArray(dtos) ? dtos : []).map((dto) => taskOccurrenceFromDTO(dto)),
    );
  }

  async getOccurrence(id: string): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.getTaskOccurrenceById(id);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async deleteOccurrence(id: string): Promise<Result<void>> {
    return this.instanceApi.deleteTaskOccurrence(id);
  }

  async startOccurrence(id: string): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.startTaskOccurrence(id);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async completeOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.completeTaskOccurrence(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async uncompleteOccurrence(id: string): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.uncompleteTaskOccurrence(id);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async skipOccurrence(id: string, request?: SkipTaskOccurrenceReq): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.skipTaskOccurrence(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async markOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.markTaskOccurrenceMissed(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async rescheduleOccurrence(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.rescheduleTaskOccurrence(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async setOccurrenceChecklistItem(
    id: string,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.setTaskOccurrenceChecklistItem(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }
}

// ===== Factory =====

export function createTaskClientService(
  templateApi: ITaskPlanApiClient,
  instanceApi: ITaskOccurrenceApiClient,
): TaskClientService {
  return new TaskClientService(templateApi, instanceApi);
}
