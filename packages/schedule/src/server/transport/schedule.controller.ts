/**
 * Read-only raw ScheduleTask diagnostics controller.
 *
 * Raw worker-job mutations stay behind owner-domain commands -> SchedulingPort
 * and internal Scheduler use cases; they are not product transport operations.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import { ScheduleTaskQueryParamsSchema } from '@memoflow/contracts/schedule';
import { formatZodErrors } from '@memoflow/utils/result';
import type { ScheduleApplicationPort } from '../application';

export class ScheduleController {
  constructor(private readonly api: ScheduleApplicationPort) {}

  async listTasks(query: Record<string, unknown>, ctx: Context): Promise<Result<unknown>> {
    const parsed = ScheduleTaskQueryParamsSchema.safeParse(query);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.api.listTasks(parsed.data, ctx);
  }

  async getTask(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.api.getTask(id, ctx);
  }

  async getDueTasks(ctx: Context): Promise<Result<unknown>> {
    return this.api.getDueTasks(ctx);
  }

  async queryRebuildTimeline(ctx: Context): Promise<Result<unknown>> {
    return this.api.queryRebuildTimeline(ctx);
  }

  async replayRebuildOutbox(operationId: string, ctx: Context): Promise<Result<unknown>> {
    return this.api.replayRebuildOutbox(operationId, ctx);
  }

  async getOperationAudit(ctx: Context): Promise<Result<unknown>> {
    return this.api.getOperationAudit(ctx);
  }
}
