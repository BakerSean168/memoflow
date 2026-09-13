/**
 * TaskOccurrence Controller
 *
 * Encapsulates Zod validation and use case orchestration for task occurrences.
 * Shared by both Express (HTTP) and IPC transport layers.
 *
 * Each method:
 * 1. Validates input via Zod schema (where applicable)
 * 2. Delegates to the corresponding use case
 * 3. Returns a Result<T> (transport-agnostic)
 */

import type { Result } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import { isOk, ok } from '@memoflow/contracts/result';
import type {
  GetTaskOccurrencesByRangeReq,
  TaskOccurrenceClientDTO,
  TaskOccurrenceStatus,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
  SetTaskOccurrenceChecklistItemReq,
} from '@memoflow/contracts/task';
import type { CompleteTaskOccurrenceUseCase } from '../application/use-cases/commands/complete-task-occurrence.use-case';
import type { UncompleteTaskOccurrenceUseCase } from '../application/use-cases/commands/uncomplete-task-occurrence.use-case';
import type { DeleteTaskOccurrenceUseCase } from '../application/use-cases/commands/delete-task-occurrence.use-case';
import type { GetTaskOccurrenceUseCase } from '../application/use-cases/queries/get-task-occurrence.use-case';
import type { GetTaskOccurrencesByDateRangeUseCase } from '../application/use-cases/queries/get-task-occurrences-by-date-range.use-case';
import type { ListTaskOccurrencesByAccountUseCase } from '../application/use-cases/queries/list-task-occurrences-by-account.use-case';
import type { ListTaskOccurrencesByStatusUseCase } from '../application/use-cases/queries/list-task-occurrences-by-status.use-case';
import type { ListTaskOccurrencesByPlanUseCase } from '../application/use-cases/queries/list-task-occurrences-by-plan.use-case';
import type { SkipTaskOccurrenceUseCase } from '../application/use-cases/commands/skip-task-occurrence.use-case';
import type { StartTaskOccurrenceUseCase } from '../application/use-cases/commands/start-task-occurrence.use-case';
import type { MarkTaskOccurrenceMissedUseCase } from '../application/use-cases/commands/mark-task-occurrence-missed.use-case';
import type { RescheduleTaskOccurrenceUseCase } from '../application/use-cases/commands/reschedule-task-occurrence.use-case';
import type { SetTaskOccurrenceChecklistItemUseCase } from '../application/use-cases/commands/set-task-occurrence-checklist-item.use-case';

type TaskControllerFn<T extends (...args: never[]) => unknown> = (
  ...args: Parameters<T>
) => ReturnType<T>;

export interface TaskOccurrenceUseCases {
  getTaskOccurrence: TaskControllerFn<GetTaskOccurrenceUseCase['execute']>;
  listByAccount: TaskControllerFn<ListTaskOccurrencesByAccountUseCase['execute']>;
  listByTemplate: TaskControllerFn<ListTaskOccurrencesByPlanUseCase['execute']>;
  listByStatus: TaskControllerFn<ListTaskOccurrencesByStatusUseCase['execute']>;
  getByDateRange: TaskControllerFn<GetTaskOccurrencesByDateRangeUseCase['execute']>;
  complete: TaskControllerFn<CompleteTaskOccurrenceUseCase['execute']>;
  uncomplete: TaskControllerFn<UncompleteTaskOccurrenceUseCase['execute']>;
  skip: TaskControllerFn<SkipTaskOccurrenceUseCase['execute']>;
  markMissed: TaskControllerFn<MarkTaskOccurrenceMissedUseCase['execute']>;
  start: TaskControllerFn<StartTaskOccurrenceUseCase['execute']>;
  deleteOccurrence: TaskControllerFn<DeleteTaskOccurrenceUseCase['execute']>;
  reschedule: TaskControllerFn<RescheduleTaskOccurrenceUseCase['execute']>;
  setOccurrenceChecklistItem: TaskControllerFn<SetTaskOccurrenceChecklistItemUseCase['execute']>;
}

/**
 * TaskOccurrence Controller
 *
 * Provides validated use-case calls for the TaskOccurrence module.
 * Used by both expressAdapter (HTTP) and ipcAdapter (IPC).
 */
export class TaskOccurrenceController {
  constructor(private readonly useCases: TaskOccurrenceUseCases) {}

  /**
   * Get occurrence by ID
   */
  async getOccurrence(id: string, ctx: Context): Promise<Result<TaskOccurrenceClientDTO | null>> {
    return await this.useCases.getTaskOccurrence(id, ctx.identityId);
  }

  /**
   * List occurrences for account
   */
  async listOccurrences(
    identityId: string,
    filters?: {
      planId?: string;
      status?: TaskOccurrenceStatus;
    },
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    if (filters?.planId) {
      return await this.useCases.listByTemplate(filters.planId, identityId);
    } else if (filters?.status) {
      return await this.useCases.listByStatus(identityId, filters.status);
    } else {
      return await this.useCases.listByAccount(identityId);
    }
  }

  /**
   * Get occurrences by date range
   */
  async getOccurrencesByDateRange(
    identityId: string,
    request: GetTaskOccurrencesByRangeReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const result = await this.useCases.getByDateRange(
      identityId,
      request.startDate,
      request.endDate,
    );

    if (!isOk(result)) {
      return result as Result<TaskOccurrenceClientDTO[]>;
    }

    return ok(result.data.data);
  }

  /**
   * Complete occurrence (with Zod validation)
   */
  async completeOccurrence(
    id: string,
    input: CompleteTaskOccurrenceReq,
    ctx: Context,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    const result = await this.useCases.complete(id, ctx.identityId, input);
    if (!isOk(result)) {
      return result as Result<TaskOccurrenceClientDTO>;
    }

    return ok(result.data.occurrence);
  }

  async uncompleteOccurrence(id: string, ctx: Context): Promise<Result<TaskOccurrenceClientDTO>> {
    const result = await this.useCases.uncomplete(id, ctx.identityId);
    if (!isOk(result)) {
      return result as Result<TaskOccurrenceClientDTO>;
    }

    return ok(result.data.occurrence);
  }

  /**
   * Skip occurrence (with Zod validation)
   */
  async skipOccurrence(
    id: string,
    input: SkipTaskOccurrenceReq,
    ctx: Context,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    const result = await this.useCases.skip(id, ctx.identityId, input);
    if (!isOk(result)) {
      return result as Result<TaskOccurrenceClientDTO>;
    }

    return ok(result.data.occurrence);
  }

  /** Explicitly records a Missed fact; never called from a clock/maintenance path. */
  async markOccurrenceMissed(
    id: string,
    input: MarkTaskOccurrenceMissedReq,
    ctx: Context,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    const result = await this.useCases.markMissed(id, ctx.identityId, input);
    if (!isOk(result)) {
      return result as Result<TaskOccurrenceClientDTO>;
    }
    return ok(result.data.occurrence);
  }

  /**
   * Start occurrence
   */
  async startOccurrence(id: string, ctx: Context): Promise<Result<TaskOccurrenceClientDTO>> {
    return await this.useCases.start(id, ctx.identityId);
  }

  /** Toggle one checklist item on this occurrence snapshot only. */
  async setOccurrenceChecklistItem(
    id: string,
    input: SetTaskOccurrenceChecklistItemReq,
    ctx: Context,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    const result = await this.useCases.setOccurrenceChecklistItem(id, ctx.identityId, input);
    if (!isOk(result)) return result as Result<TaskOccurrenceClientDTO>;
    return ok(result.data.occurrence);
  }

  /** Reschedule this occurrence only; identity is always host-injected. */
  async rescheduleOccurrence(
    id: string,
    input: RescheduleTaskInput,
    ctx: Context,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.useCases.reschedule(id, ctx.identityId, input);
  }

  /**
   * Delete occurrence
   */
  async deleteOccurrence(id: string, ctx: Context): Promise<Result<null>> {
    const result = await this.useCases.deleteOccurrence(id, ctx.identityId);
    if (!isOk(result)) {
      return result as Result<null>;
    }
    // Serialize as data:null (no Result.void / undefined dual-track).
    return ok(null);
  }
}
