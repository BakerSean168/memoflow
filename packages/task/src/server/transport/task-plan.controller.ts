/**
 * TaskPlan Controller
 *
 * Encapsulates Zod validation and use case orchestration for task plans.
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
  TaskPlanClientDTO,
  CreateTaskPlanRes,
  TaskOccurrenceClientDTO,
  CreateTaskPlanInput,
  ListTaskPlanFilters,
  TaskPlanOccurrencesQuery,
  QueryTaskPlansInternal,
  CreateTaskPlanReq,
  UpdateTaskPlanReq,
  GenerateOccurrencesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
} from '@memoflow/contracts/task';
import type { Context } from '@memoflow/contracts/shared';
import type { GoalId } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import type { CreateTaskPlanUseCase } from '../application/use-cases/commands/create-task-plan.use-case';
import type { GetTaskPlanUseCase } from '../application/use-cases/queries/get-task-plan.use-case';
import type { ListTaskPlansUseCase } from '../application/use-cases/queries/list-task-plans.use-case';
import type { UpdateTaskPlanUseCase } from '../application/use-cases/commands/update-task-plan.use-case';
import type { DeleteTaskPlanUseCase } from '../application/use-cases/commands/delete-task-plan.use-case';
import type { ActivateTaskPlanUseCase } from '../application/use-cases/commands/activate-task-plan.use-case';
import type { PauseTaskPlanUseCase } from '../application/use-cases/commands/pause-task-plan.use-case';
import type { ArchiveTaskPlanUseCase } from '../application/use-cases/commands/archive-task-plan.use-case';
import type { AbandonTaskPlanUseCase } from '../application/use-cases/commands/abandon-task-plan.use-case';
import type { GenerateTaskOccurrencesUseCase } from '../application/use-cases/commands/generate-task-occurrences.use-case';
import type { BindTaskToGoalUseCase } from '../application/use-cases/commands/bind-task-to-goal.use-case';
import type { UnbindTaskFromGoalUseCase } from '../application/use-cases/commands/unbind-task-from-goal.use-case';
import type { ListTaskOccurrencesByPlanUseCase } from '../application/use-cases/queries/list-task-occurrences-by-plan.use-case';

type TaskControllerFn<T extends (...args: never[]) => unknown> = (
  ...args: Parameters<T>
) => ReturnType<T>;

export interface TaskPlanUseCases {
  createPlan: TaskControllerFn<CreateTaskPlanUseCase['execute']>;
  getPlan: TaskControllerFn<GetTaskPlanUseCase['execute']>;
  listPlans: TaskControllerFn<ListTaskPlansUseCase['execute']>;
  updatePlan: TaskControllerFn<UpdateTaskPlanUseCase['execute']>;
  deletePlan: TaskControllerFn<DeleteTaskPlanUseCase['execute']>;
  activatePlan: TaskControllerFn<ActivateTaskPlanUseCase['execute']>;
  pausePlan: TaskControllerFn<PauseTaskPlanUseCase['execute']>;
  archivePlan: TaskControllerFn<ArchiveTaskPlanUseCase['execute']>;
  abandonPlan: TaskControllerFn<AbandonTaskPlanUseCase['execute']>;
  generateOccurrences: TaskControllerFn<GenerateTaskOccurrencesUseCase['execute']>;
  bindToGoal: TaskControllerFn<BindTaskToGoalUseCase['execute']>;
  unbindFromGoal: TaskControllerFn<UnbindTaskFromGoalUseCase['execute']>;
  listOccurrencesByPlan: TaskControllerFn<ListTaskOccurrencesByPlanUseCase['execute']>;
}

/**
 * TaskPlan Controller
 *
 * Provides validated use-case calls for the TaskPlan module.
 * Used by both expressAdapter (HTTP) and ipcAdapter (IPC).
 */
export class TaskPlanController {
  constructor(private readonly useCases: TaskPlanUseCases) {}

  private toTemplateQuery(
    filters: ListTaskPlanFilters | undefined,
    ctx: Context,
  ): QueryTaskPlansInternal {
    return {
      identityId: IdentityId.of(ctx.identityId),
      status: filters?.status,
      goalId: filters?.goalId as GoalId | undefined,
      keyResultId: filters?.keyResultId,
      labelIdsAll: filters?.labelIdsAll,
    };
  }

  /**
   * Create new task plan (with Zod validation)
   * Identity is injected from Context, not from request payload
   */
  async createPlan(input: CreateTaskPlanReq, ctx: Context): Promise<Result<CreateTaskPlanRes>> {
    // Assemble internal input with identityId from Context
    const createInput: CreateTaskPlanInput = {
      identityId: IdentityId.of(ctx.identityId),
      name: input.name,
      description: input.description,
      schedule: input.schedule,
      reminderConfig: input.reminderConfig,
      importance: input.importance,
      labelIds: input.labelIds,
      goalBinding: input.goalBinding,
      completionPolicy: input.completionPolicy,
    };

    const result = await this.useCases.createPlan(createInput);

    if (!isOk(result)) {
      return result;
    }

    return ok(result.data);
  }

  /**
   * Get plan by ID
   */
  async getPlan(
    id: string,
    ctx: Context,
  ): Promise<Result<TaskPlanClientDTO | null>> {
    const result = await this.useCases.getPlan(id, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskPlanClientDTO | null>;
    }

    return ok(result.data ?? null);
  }

  /**
   * List plans for account
   * Identity is injected from Context, not from request payload
   */
  async listPlans(
    filters: ListTaskPlanFilters | undefined,
    ctx: Context,
  ): Promise<Result<{ plans: TaskPlanClientDTO[]; total: number }>> {
    const result = await this.useCases.listPlans(this.toTemplateQuery(filters, ctx));

    if (!isOk(result)) {
      return result as Result<{ plans: TaskPlanClientDTO[]; total: number }>;
    }

    return ok({ plans: result.data.plans, total: result.data.total });
  }

  /**
   * List plans together with the dependency edges between them.
   */

  /**
   * Update plan (with Zod validation)
   */
  async updatePlan(
    id: string,
    input: UpdateTaskPlanReq,
    ctx: Context,
  ): Promise<Result<TaskPlanClientDTO>> {
    return await this.useCases.updatePlan(id, ctx.identityId, {
      name: input.name,
      description: input.description,
      schedule: input.schedule,
      reminderConfig: input.reminderConfig,
      importance: input.importance,
      labelIds: input.labelIds,
      goalBinding: input.goalBinding,
      completionPolicy: input.completionPolicy,
    });
  }

  /**
   * Delete plan
   */
  async deletePlan(id: string, ctx: Context): Promise<Result<null>> {
    const result = await this.useCases.deletePlan(id, ctx.identityId);
    if (!isOk(result)) {
      return result as Result<null>;
    }
    // Serialize as data:null (no { success: boolean } / undefined dual-track).
    return ok(null);
  }

  /**
   * Activate plan
   */
  async activatePlan(id: string, ctx: Context): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.useCases.activatePlan(id, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskPlanClientDTO>;
    }

    return ok(result.data.plan);
  }

  /**
   * Pause plan
   */
  async pausePlan(id: string, ctx: Context): Promise<Result<TaskPlanClientDTO>> {
    const result = await this.useCases.pausePlan(id, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskPlanClientDTO>;
    }

    return ok(result.data.plan);
  }

  /**
   * Archive plan
   */
  async archivePlan(id: string, ctx: Context): Promise<Result<TaskPlanClientDTO>> {
    return await this.useCases.archivePlan(id, ctx.identityId);
  }

  async abandonPlan(
    id: string,
    request: AbandonTaskPlanReq,
    ctx: Context,
  ): Promise<Result<TaskPlanClientDTO>> {
    return await this.useCases.abandonPlan(id, ctx.identityId, request);
  }

  /**
   * Generate occurrences for a plan
   */
  async generateOccurrences(
    id: string,
    input: GenerateOccurrencesReq,
    ctx: Context,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return await this.useCases.generateOccurrences(id, ctx.identityId, input);
  }

  /**
   * Get occurrences by plan ID
   */
  async getOccurrencesByPlan(
    planId: string,
    ctx: Context,
    range?: TaskPlanOccurrencesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const result = await this.useCases.listOccurrencesByPlan(planId, ctx.identityId);

    if (!isOk(result)) {
      return result as Result<TaskOccurrenceClientDTO[]>;
    }

    if (!range?.from && !range?.to) {
      return result;
    }

    return ok(
      result.data.filter((occurrence) => {
        if (range.from != null && occurrence.dueAt < range.from) {
          return false;
        }

        if (range.to != null && occurrence.dueAt > range.to) {
          return false;
        }

        return true;
      }),
    );
  }

  /**
   * Bind plan to goal
   */
  async bindToGoal(
    id: string,
    input: BindToGoalReq,
    ctx: Context,
  ): Promise<Result<TaskPlanClientDTO>> {
    return await this.useCases.bindToGoal(id, ctx.identityId, input);
  }

  /**
   * Unbind plan from goal
   */
  async unbindFromGoal(id: string, ctx: Context): Promise<Result<TaskPlanClientDTO>> {
    return await this.useCases.unbindFromGoal(id, ctx.identityId);
  }
}
