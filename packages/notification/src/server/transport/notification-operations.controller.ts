import type { Result } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type { NotificationOperationsPort } from '../application';

/** Operations/admin controller kept outside the product Inbox port. */
export class NotificationOperationsController {
  constructor(private readonly operations: NotificationOperationsPort) {}

  queryDeadLetters(ctx: Context): Promise<Result<unknown>> {
    return this.operations.queryDeadLetters(ctx.identityId);
  }

  replayDeadLetter(operationId: string, ctx: Context): Promise<Result<unknown>> {
    return this.operations.replayDeadLetter(operationId, ctx.identityId);
  }

  getDeliveryReceipts(
    ctx: Context,
    query?: { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<Result<unknown>> {
    return this.operations.getDeliveryReceipts(ctx.identityId, query);
  }

  getOperationTimeline(
    ctx: Context,
    query?: { status?: string; limit?: number },
  ): Promise<Result<unknown>> {
    return this.operations.getOperationTimeline(ctx.identityId, query);
  }

  getOperationAudit(
    ctx: Context,
    query?: { source?: string; operationId?: string; limit?: number },
  ): Promise<Result<unknown>> {
    return this.operations.getOperationAudit(ctx.identityId, query);
  }
}
