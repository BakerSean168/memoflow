/**
 * TaskTemplate Controller
 *
 * Encapsulates Zod validation and use case orchestration for task templates.
 * Shared by both Express (HTTP) and IPC transport layers.
 *
 * Each method:
 * 1. Validates input via Zod schema (where applicable)
 * 2. Delegates to the corresponding use case
 * 3. Returns a Result<T> (transport-agnostic)
 */

import type { Result } from '@memoflow/contracts/result';
import { isOk, ok } from '@memoflow/contracts/result';
import type {
  TaskTemplateClientDTO,
  CreateTaskTemplateRes,
  TaskInstanceClientDTO,
  CreateTaskTemplateInput,
  ListTaskTemplateFilters,
  TaskTemplateInstancesQuery,
  QueryTaskTemplatesInternal,
  CreateTaskTemplateReq,
  UpdateTaskTemplateReq,
  GenerateInstancesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
} from '@memoflow/contracts/task';
import type { Context } from '@memoflow/contracts/shared';
import type { GoalId } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import type { CreateTaskTemplateUseCase } from '../application/use-cases/commands/create-task-template.use-case';
import type { GetTaskTemplateUseCase } from '../application/use-cases/queries/get-task-template.use-case';
import type { ListTaskTemplatesUseCase } from '../application/use-cases/queries/list-task-templates.use-case';
import type { UpdateTaskTemplateUseCase } from '../application/use-cases/commands/update-task-template.use-case';
import type { DeleteTaskTemplateUseCase } from '../application/use-cases/commands/delete-task-template.use-case';
import type { ActivateTaskTemplateUseCase } from '../application/use-cases/commands/activate-task-template.use-case';
import type { PauseTaskTemplateUseCase } from '../application/use-cases/commands/pause-task-template.use-case';
import type { ArchiveTaskTemplateUseCase } from '../application/use-cases/commands/archive-task-template.use-case';
import type { AbandonTaskPlanUseCase } from '../application/use-cases/commands/abandon-task-plan.use-case';
import type { GenerateTaskInstancesUseCase } from '../application/use-cases/commands/generate-task-instances.use-case';
import type { BindTaskToGoalUseCase } from '../application/use-cases/commands/bind-task-to-goal.use-case';
import type { UnbindTaskFromGoalUseCase } from '../application/use-cases/commands/unbind-task-from-goal.use-case';
import type { ListTaskInstancesByTemplateUseCase } from '../application/use-cases/queries/list-task-instances-by-template.use-case';

type TaskControllerFn<T extends (...args: never[]) => unknown> = (
  ...args: Parameters<T>
) => ReturnType<T>;

export interface TaskTemplateUseCases {
  createTemplate: TaskControllerFn<CreateTaskTemplateUseCase['execute']>;
  getTemplate: TaskControllerFn<GetTaskTemplateUseCase['execute']>;
  listTemplates: TaskControllerFn<ListTaskTemplatesUseCase['execute']>;
  updateTemplate: TaskControllerFn<UpdateTaskTemplateUseCase['execute']>;
  deleteTemplate: TaskControllerFn<DeleteTaskTemplateUseCase['execute']>;
  activateTemplate: TaskControllerFn<ActivateTaskTemplateUseCase['execute']>;
  pauseTemplate: TaskControllerFn<PauseTaskTemplateUseCase['execute']>;
  archiveTemplate: TaskControllerFn<ArchiveTaskTemplateUseCase['execute']>;
  abandonPlan: TaskControllerFn<AbandonTaskPlanUseCase['execute']>;
  generateInstances: TaskControllerFn<GenerateTaskInstancesUseCase['execute']>;
  bindToGoal: TaskControllerFn<BindTaskToGoalUseCase['execute']>;
  unbindFromGoal: TaskControllerFn<UnbindTaskFromGoalUseCase['execute']>;
  listInstancesByTemplate: TaskControllerFn<ListTaskInstancesByTemplateUseCase['execute']>;
}

/**
 * TaskTemplate Controller
 *
 * Provides validated use-case calls for the TaskTemplate module.
 * Used by both expressAdapter (HTTP) and ipcAdapter (IPC).
 */
export class TaskTemplateController {
  constructor(private readonly useCases: TaskTemplateUseCases) {}

  private toTemplateQuery(
    filters: ListTaskTemplateFilters | undefined,
    ctx: Context,
  ): QueryTaskTemplatesInternal {
    return {
      identityId: IdentityId.of(ctx.identityId),
      status: filters?.status,
      goalId: filters?.goalId as GoalId | undefined,
      labelIdsAll: filters?.labelIdsAll,
    };
  }

  /**
   * Create new task template (with Zod validation)
   * Identity is injected from Context, not from request payload
   */
  async createTemplate(
    input: CreateTaskTemplateReq,
    ctx: Context,
  ): Promise<Result<CreateTaskTemplateRes>> {
    // Assemble internal input with identityId from Context
    const createInput: CreateTaskTemplateInput = {
      identityId: IdentityId.of(ctx.identityId),
      name: input.name,
      description: input.description,
      taskType: input.taskType,
      timeConfig: input.timeConfig,
      recurrenceRule: input.recurrenceRule,
      reminderConfig: input.reminderConfig,
      importance: input.importance,
      labelIds: input.labelIds,
      goalBinding: input.goalBinding,
      completionPolicy: input.completionPolicy,
    };

    const result = await this.useCases.createTemplate(createInput);

    if (!isOk(result)) {
      return result;
    }

    return ok(result.data);
  }

  /**
   * Get template by ID
   */
  async getTemplate(
    id: string,
    ctx: Context,
    includeChildren = false,
  ): Promise<Result<TaskTemplateClientDTO | null>> {
    const result = await this.useCases.getTemplate(id, ctx.identityId, includeChildren);

    if (!isOk(result)) {
      return result as Result<TaskTemplateClientDTO | null>;
    }

    return ok(result.data ?? null);
  }

  /**
   * List templates for account
   * Identity is injected from Context, not from request payload
   */
  async listTemplates(
    filters: ListTaskTemplateFilters | undefined,
    ctx: Context,
  ): Promise<Result<{ templates: TaskTemplateClientDTO[]; total: number }>> {
    const result = await this.useCases.listTemplates(this.toTemplateQuery(filters, ctx));

    if (!isOk(result)) {
      return result as Result<{ templates: TaskTemplateClientDTO[]; total: number }>;
    }

    return ok({ templates: result.data.templates, total: result.data.total });
  }

  /**
   * List templates together with the dependency edges between them.
   */

  /**
   * Update template (with Zod validation)
   */
  async updateTemplate(
    id: string,
    input: UpdateTaskTemplateReq,
    ctx: Context,
  ): Promise<Result<TaskTemplateClientDTO>> {
    return await this.useCases.updateTemplate(id, ctx.identityId, {
      name: input.name,
      description: input.description,
      timeConfig: input.timeConfig,
      recurrenceRule: input.recurrenceRule,
      reminderConfig: input.reminderConfig,
      importance: input.importance,
      labelIds: input.labelIds,
      goalBinding: input.goalBinding,
      completionPolicy: input.completionPolicy,
    });
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string, ctx: Context): Promise<Result<null>> {
    const result = await this.useCases.deleteTemplate(id, ctx.identityId);
    if (!isOk(result)) {
      return result as Result<null>;
    }
    // Serialize as data:null (no { success: boolean } / undefined dual-track).
    return ok(null);
  }

  /**
   * Activate template
   */
  async activateTemplate(id: string, ctx: Context): Promise<Result<TaskTemplateClientDTO>> {
    const result = await this.useCases.activateTemplate(id, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskTemplateClientDTO>;
    }

    return ok(result.data.template);
  }

  /**
   * Pause template
   */
  async pauseTemplate(id: string, ctx: Context): Promise<Result<TaskTemplateClientDTO>> {
    const result = await this.useCases.pauseTemplate(id, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskTemplateClientDTO>;
    }

    return ok(result.data.template);
  }

  /**
   * Archive template
   */
  async archiveTemplate(id: string, ctx: Context): Promise<Result<TaskTemplateClientDTO>> {
    return await this.useCases.archiveTemplate(id, ctx.identityId);
  }

  async abandonPlan(
    id: string,
    request: AbandonTaskPlanReq,
    ctx: Context,
  ): Promise<Result<TaskTemplateClientDTO>> {
    return await this.useCases.abandonPlan(id, ctx.identityId, request);
  }


  /**
   * Generate instances for a template
   */
  async generateInstances(
    id: string,
    input: GenerateInstancesReq,
    ctx: Context,
  ): Promise<Result<TaskInstanceClientDTO[]>> {
    return await this.useCases.generateInstances(id, ctx.identityId, input);
  }

  /**
   * Get instances by template ID
   */
  async getInstancesByTemplate(
    templateId: string,
    ctx: Context,
    range?: TaskTemplateInstancesQuery,
  ): Promise<Result<TaskInstanceClientDTO[]>> {
    const result = await this.useCases.listInstancesByTemplate(templateId, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskInstanceClientDTO[]>;
    }

    if (!range?.from && !range?.to) {
      return result;
    }

    return ok(
      result.data.filter((instance) => {
        if (range.from != null && instance.instanceDate < range.from) {
          return false;
        }

        if (range.to != null && instance.instanceDate > range.to) {
          return false;
        }

        return true;
      }),
    );
  }

  /**
   * Bind template to goal
   */
  async bindToGoal(
    id: string,
    input: BindToGoalReq,
    ctx: Context,
  ): Promise<Result<TaskTemplateClientDTO>> {
    return await this.useCases.bindToGoal(id, ctx.identityId, input);
  }

  /**
   * Unbind template from goal
   */
  async unbindFromGoal(id: string, ctx: Context): Promise<Result<TaskTemplateClientDTO>> {
    return await this.useCases.unbindFromGoal(id, ctx.identityId);
  }
}
