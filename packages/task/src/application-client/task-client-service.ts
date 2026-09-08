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
  CreateTaskTemplateReq,
  UpdateTaskTemplateReq,
  GenerateInstancesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  CompleteTaskInstanceReq,
  MarkTaskInstanceMissedReq,
  SkipTaskInstanceReq,
  RescheduleTaskInput,
  GetTaskInstancesByRangeReq,
  TaskInstanceClientDTO,
  TaskTemplateClientDTO,
  TaskTimeConfig,
  TaskTimeConfigDTO,
  RecurrenceRule,
  RecurrenceRuleDTO,
  TaskReminderConfig,
  TaskGoalBinding,
  TaskGoalBindingDTO,
} from '@memoflow/contracts/task';
import type {
  ITaskTemplateApiClient,
  TaskTemplateListParams,
} from './ports/task-template-api-client.port';
import type { ITaskInstanceApiClient } from './ports/task-instance-api-client.port';
import { TaskTemplate } from '../domain-client/aggregates/task-template';
import { TaskInstance } from '../domain-client/aggregates/task-instance';
import { TaskTemplateId } from '../server/domain/value-objects/task-template-id';
import { TaskInstanceId } from '../server/domain/value-objects/task-instance-id';
import { IdentityId } from '@memoflow/domain-shared';

// ===== DTO-to-State Mappers =====

function taskTemplateFromDTO(dto: TaskTemplateClientDTO): TaskTemplate {
  return TaskTemplate.load({
    id: TaskTemplateId.of(dto.id),
    identityId: IdentityId.of(dto.identityId),
    name: dto.name,
    description: dto.description,
    timeConfig: parseTimeConfig(dto.timeConfig),
    recurrenceRule: dto.recurrenceRule ? parseRecurrenceRule(dto.recurrenceRule) : null,
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
    startDate: dto.startDate ? dto.startDate : null,
    dueDate: dto.dueDate ?? null,
    completedAt: dto.completedAt ? dto.completedAt : null,
    estimatedMinutes: dto.estimatedMinutes,
    actualMinutes: dto.actualMinutes,
    comment: dto.comment,
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

function taskInstanceFromDTO(dto: TaskInstanceClientDTO): TaskInstance {
  return TaskInstance.load({
    id: TaskInstanceId.of(dto.id),
    templateId: TaskTemplateId.of(dto.templateId),
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

function parseRecurrenceRule(dto: RecurrenceRuleDTO): RecurrenceRule {
  return {
    frequency: dto.frequency,
    interval: dto.interval,
    daysOfWeek: dto.daysOfWeek,
    endDate: dto.endDate ? dto.endDate : null,
    occurrences: dto.occurrences,
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
    private readonly templateApi: ITaskTemplateApiClient,
    private readonly instanceApi: ITaskInstanceApiClient,
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
    request: CreateTaskTemplateReq,
  ): Promise<
    Result<{ template: TaskTemplate; instanceCount: number; todayInstanceCreated: boolean }>
  > {
    const result = await this.templateApi.createTaskTemplate(request);
    return mapResult(result, (data) => ({
      template: taskTemplateFromDTO(data.template),
      instanceCount: data.instanceCount,
      todayInstanceCreated: data.todayInstanceCreated,
    }));
  }

  async listTemplates(
    params?: TaskTemplateListParams,
  ): Promise<Result<{ templates: TaskTemplate[]; total: number }>> {
    const result = await this.templateApi.getTaskTemplates(params);
    return mapResult(result, (data) => {
      const templates = data.templates ?? [];
      const total = data.total ?? templates.length;
      return {
        templates: templates.map((dto) => taskTemplateFromDTO(dto)),
        total,
      };
    });
  }

  async getTemplate(id: string): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.getTaskTemplateById(id);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async updateTemplate(id: string, request: UpdateTaskTemplateReq): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.updateTaskTemplate(id, request);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async deleteTemplate(id: string): Promise<Result<void>> {
    return this.templateApi.deleteTaskTemplate(id);
  }

  async activateTemplate(id: string): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.activateTaskTemplate(id);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async pauseTemplate(id: string): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.pauseTaskTemplate(id);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async archiveTemplate(id: string): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.archiveTaskTemplate(id);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.abandonTaskPlan(id, request);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async generateInstances(
    templateId: string,
    request: GenerateInstancesReq,
  ): Promise<Result<TaskInstance[]>> {
    const result = await this.templateApi.generateInstances(templateId, request);
    return mapResult(result, (dtos) => dtos.map((dto) => taskInstanceFromDTO(dto)));
  }

  async getInstancesByDateRange(
    templateId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskInstance[]>> {
    const result = await this.templateApi.getInstancesByDateRange(templateId, { from, to });
    return mapResult(result, (dtos) => dtos.map((dto) => taskInstanceFromDTO(dto)));
  }

  async bindToGoal(templateId: string, request: BindToGoalReq): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.bindToGoal(templateId, request);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  async unbindFromGoal(templateId: string): Promise<Result<TaskTemplate>> {
    const result = await this.templateApi.unbindFromGoal(templateId);
    return mapResult(result, (dto) => taskTemplateFromDTO(dto));
  }

  // ===== Task Instance Operations =====

  async listInstances(params?: {
    page?: number;
    limit?: number;
    templateId?: string;
    status?: string;
  }): Promise<Result<TaskInstance[]>> {
    const result = await this.instanceApi.getTaskInstances(params);
    return mapResult(result, (dtos) =>
      (Array.isArray(dtos) ? dtos : []).map((dto) => taskInstanceFromDTO(dto)),
    );
  }

  async listInstancesByDateRange(from: number, to: number): Promise<Result<TaskInstance[]>> {
    const request: GetTaskInstancesByRangeReq = {
      startDate: from,
      endDate: to,
    };
    const result = await this.instanceApi.getTaskInstancesByDateRange(request);
    return mapResult(result, (dtos) =>
      (Array.isArray(dtos) ? dtos : []).map((dto) => taskInstanceFromDTO(dto)),
    );
  }

  async getInstance(id: string): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.getTaskInstanceById(id);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }

  async deleteInstance(id: string): Promise<Result<void>> {
    return this.instanceApi.deleteTaskInstance(id);
  }

  async startInstance(id: string): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.startTaskInstance(id);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }

  async completeInstance(
    id: string,
    request?: CompleteTaskInstanceReq,
  ): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.completeTaskInstance(id, request);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }

  async uncompleteInstance(id: string): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.uncompleteTaskInstance(id);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }

  async skipInstance(id: string, request?: SkipTaskInstanceReq): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.skipTaskInstance(id, request);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }

  async markInstanceMissed(
    id: string,
    request?: MarkTaskInstanceMissedReq,
  ): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.markTaskInstanceMissed(id, request);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }

  async rescheduleInstance(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskInstance>> {
    const result = await this.instanceApi.rescheduleTaskInstance(id, request);
    return mapResult(result, (dto) => taskInstanceFromDTO(dto));
  }
}

// ===== Factory =====

export function createTaskClientService(
  templateApi: ITaskTemplateApiClient,
  instanceApi: ITaskInstanceApiClient,
): TaskClientService {
  return new TaskClientService(templateApi, instanceApi);
}
