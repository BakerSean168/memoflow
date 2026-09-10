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
  GenerateInstancesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
  GetTaskOccurrencesByRangeReq,
  TaskOccurrenceClientDTO,
  TaskPlanClientDTO,
  TaskTimeConfig,
  TaskTimeConfigDTO,
  TaskReminderConfig,
  TaskGoalBinding,
  TaskGoalBindingDTO,
} from '@memoflow/contracts/task';
import type { ITaskPlanApiClient, TaskPlanListParams } from './ports/task-plan-api-client.port';
import type { ITaskOccurrenceApiClient } from './ports/task-occurrence-api-client.port';
import { TaskPlan } from '../domain-client/aggregates/task-plan';
import { TaskOccurrence } from '../domain-client/aggregates/task-occurrence';
import { TaskPlanId } from '../server/domain/value-objects/task-plan-id';
import { TaskOccurrenceId } from '../server/domain/value-objects/task-occurrence-id';
import { IdentityId } from '@memoflow/domain-shared';

// ===== DTO-to-State Mappers =====

function taskPlanFromDTO(dto: TaskPlanClientDTO): TaskPlan {
  return TaskPlan.load({
    id: TaskPlanId.of(dto.id),
    identityId: IdentityId.of(dto.identityId),
    name: dto.name,
    description: dto.description,
    schedule: structuredClone(dto.schedule),
    reminderConfig: dto.reminderConfig as TaskReminderConfig | null,
    importance: dto.importance,
    goalBinding: dto.goalBinding ? parseGoalBinding(dto.goalBinding) : null,
    labels: dto.labels ?? [],
    status: dto.status,
    outcome: dto.outcome,
    completionPolicy: dto.completionPolicy,
    closedAt: dto.closedAt,
    archivedAt: dto.archivedAt,
    abandonedReason: dto.abandonedReason,
    lastGeneratedDate: dto.lastGeneratedDate ?? null,
    generateAheadDays: dto.generateAheadDays,
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt ? dto.deletedAt : null,
    instanceCount: dto.instanceCount,
    completedInstanceCount: dto.completedInstanceCount,
    pendingInstanceCount: dto.pendingInstanceCount,
    dueInstanceCount: dto.dueInstanceCount,
    completedDueInstanceCount: dto.completedDueInstanceCount,
    completionWindowDays: dto.completionWindowDays,
    futurePendingInstanceCount: dto.futurePendingInstanceCount,
    singleInstanceStatus: dto.singleInstanceStatus,
    completionRate: dto.completionRate,
    history: dto.history,
    instances: dto.instances,
  });
}

function taskOccurrenceFromDTO(dto: TaskOccurrenceClientDTO): TaskOccurrence {
  return TaskOccurrence.load({
    id: TaskOccurrenceId.of(dto.id),
    templateId: TaskPlanId.of(dto.templateId),
    identityId: IdentityId.of(dto.identityId),
    instanceDate: dto.instanceDate,
    timeConfig: parseTimeConfig(dto.timeConfig),
    importance: dto.importance,
    status: dto.status,
    isOverdue: dto.isOverdue,
    actualStartTime: dto.actualStartTime ? dto.actualStartTime : null,
    actualEndTime: dto.actualEndTime ? dto.actualEndTime : null,
    comment: dto.comment,
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt ? dto.deletedAt : null,
  });
}

function parseTimeConfig(dto: TaskTimeConfigDTO): TaskTimeConfig {
  return {
    timeType: dto.timeType,
    startDate: dto.startDate ? dto.startDate : null,
    timePoint: dto.timePoint,
    timeRange: dto.timeRange,
  };
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
    this.createTemplate = this.createTemplate.bind(this);
    this.listTemplates = this.listTemplates.bind(this);
    this.getTemplate = this.getTemplate.bind(this);
    this.updateTemplate = this.updateTemplate.bind(this);
    this.deleteTemplate = this.deleteTemplate.bind(this);
    this.activateTemplate = this.activateTemplate.bind(this);
    this.pauseTemplate = this.pauseTemplate.bind(this);
    this.archiveTemplate = this.archiveTemplate.bind(this);
    this.abandonPlan = this.abandonPlan.bind(this);
    this.generateInstances = this.generateInstances.bind(this);
    this.getInstancesByDateRange = this.getInstancesByDateRange.bind(this);
    this.bindToGoal = this.bindToGoal.bind(this);
    this.unbindFromGoal = this.unbindFromGoal.bind(this);
    this.listInstances = this.listInstances.bind(this);
    this.getInstance = this.getInstance.bind(this);
    this.deleteInstance = this.deleteInstance.bind(this);
    this.startInstance = this.startInstance.bind(this);
    this.completeInstance = this.completeInstance.bind(this);
    this.skipInstance = this.skipInstance.bind(this);
    this.markInstanceMissed = this.markInstanceMissed.bind(this);
    this.rescheduleInstance = this.rescheduleInstance.bind(this);
  }

  // ===== Task Template Operations =====

  async createTemplate(
    request: CreateTaskPlanReq,
  ): Promise<Result<{ template: TaskPlan; instanceCount: number; todayInstanceCreated: boolean }>> {
    const result = await this.templateApi.createTaskPlan(request);
    return mapResult(result, (data) => ({
      template: taskPlanFromDTO(data.template),
      instanceCount: data.instanceCount,
      todayInstanceCreated: data.todayInstanceCreated,
    }));
  }

  async listTemplates(
    params?: TaskPlanListParams,
  ): Promise<Result<{ templates: TaskPlan[]; total: number }>> {
    const result = await this.templateApi.getTaskPlans(params);
    return mapResult(result, (data) => {
      const templates = data.templates ?? [];
      const total = data.total ?? templates.length;
      return {
        templates: templates.map((dto) => taskPlanFromDTO(dto)),
        total,
      };
    });
  }

  async getTemplate(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.getTaskPlanById(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async updateTemplate(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.updateTaskPlan(id, request);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async deleteTemplate(id: string): Promise<Result<void>> {
    return this.templateApi.deleteTaskPlan(id);
  }

  async activateTemplate(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.activateTaskPlan(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async pauseTemplate(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.pauseTaskPlan(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async archiveTemplate(id: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.archiveTaskPlan(id);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.abandonTaskPlan(id, request);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async generateInstances(
    templateId: string,
    request: GenerateInstancesReq,
  ): Promise<Result<TaskOccurrence[]>> {
    const result = await this.templateApi.generateInstances(templateId, request);
    return mapResult(result, (dtos) => dtos.map((dto) => taskOccurrenceFromDTO(dto)));
  }

  async getInstancesByDateRange(
    templateId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskOccurrence[]>> {
    const result = await this.templateApi.getInstancesByDateRange(templateId, { from, to });
    return mapResult(result, (dtos) => dtos.map((dto) => taskOccurrenceFromDTO(dto)));
  }

  async bindToGoal(templateId: string, request: BindToGoalReq): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.bindToGoal(templateId, request);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  async unbindFromGoal(templateId: string): Promise<Result<TaskPlan>> {
    const result = await this.templateApi.unbindFromGoal(templateId);
    return mapResult(result, (dto) => taskPlanFromDTO(dto));
  }

  // ===== Task Instance Operations =====

  async listInstances(params?: {
    page?: number;
    limit?: number;
    templateId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrence[]>> {
    const result = await this.instanceApi.getTaskOccurrences(params);
    return mapResult(result, (dtos) =>
      (Array.isArray(dtos) ? dtos : []).map((dto) => taskOccurrenceFromDTO(dto)),
    );
  }

  async listInstancesByDateRange(from: number, to: number): Promise<Result<TaskOccurrence[]>> {
    const request: GetTaskOccurrencesByRangeReq = {
      startDate: from,
      endDate: to,
    };
    const result = await this.instanceApi.getTaskOccurrencesByDateRange(request);
    return mapResult(result, (dtos) =>
      (Array.isArray(dtos) ? dtos : []).map((dto) => taskOccurrenceFromDTO(dto)),
    );
  }

  async getInstance(id: string): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.getTaskOccurrenceById(id);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async deleteInstance(id: string): Promise<Result<void>> {
    return this.instanceApi.deleteTaskOccurrence(id);
  }

  async startInstance(id: string): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.startTaskOccurrence(id);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async completeInstance(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.completeTaskOccurrence(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async uncompleteInstance(id: string): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.uncompleteTaskOccurrence(id);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async skipInstance(id: string, request?: SkipTaskOccurrenceReq): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.skipTaskOccurrence(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async markInstanceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.markTaskOccurrenceMissed(id, request);
    return mapResult(result, (dto) => taskOccurrenceFromDTO(dto));
  }

  async rescheduleInstance(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrence>> {
    const result = await this.instanceApi.rescheduleTaskOccurrence(id, request);
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
