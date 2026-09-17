import type { Result } from '@memoflow/contracts/result';

/** Internal/admin operational seam. Product clients must not receive this capability. */
export interface NotificationOperationsPort {
  queryDeadLetters(identityId: string): Promise<Result<unknown>>;
  replayDeadLetter(operationId: string, identityId: string): Promise<Result<unknown>>;
  getDeliveryReceipts(
    identityId: string,
    query?: { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<Result<unknown>>;
  getOperationTimeline(
    identityId: string,
    query?: { status?: string; limit?: number },
  ): Promise<Result<unknown>>;
  getOperationAudit(
    identityId: string,
    query?: { source?: string; operationId?: string; limit?: number },
  ): Promise<Result<unknown>>;
}
