import {
  OperationTimelineEntrySchema,
  type OperationStatus,
  type OperationTimelineEntry,
  type OperationSource as OperationSourceType,
} from '@memoflow/operations-contracts';
import type { BusinessOperationReceipt } from '@memoflow/reliable-messaging-contracts';
import type { ProjectionOperation } from '@memoflow/reliable-messaging-contracts';

/**
 * 将 W0 BusinessOperationReceipt 映射为 W7 统一 OperationTimelineEntry (A)。
 *
 * 输出经 OperationTimelineEntrySchema.parse 校验后才允许宣称成功 —
 * 禁止任何未过契约的输出。
 */
export function mapReceiptToTimelineEntry(
  receipt: BusinessOperationReceipt,
  source: OperationSourceType,
): OperationTimelineEntry {
  const entry: OperationTimelineEntry = {
    source,
    operationId: receipt.operationId,
    status: normalizeStatus(receipt.status),
    failureReason: receipt.lastError ?? null,
    attempts: receipt.attempt ?? 0,
    nextRetryAt: receipt.nextRetryAt ?? null,
    replayable: receipt.status === 'dead_letter' || receipt.status === 'failed',
    updatedAt: receipt.updatedAt,
  };
  return OperationTimelineEntrySchema.parse(entry);
}

/**
 * 将 W0 ProjectionOperation 映射为 W7 统一 OperationTimelineEntry (A)。
 */
export function mapProjectionToTimelineEntry(
  projection: ProjectionOperation,
  source: OperationSourceType,
): OperationTimelineEntry {
  const entry: OperationTimelineEntry = {
    source,
    operationId: projection.operationId,
    status: normalizeStatus(projection.status),
    failureReason: projection.lastError ?? null,
    attempts: projection.attempt ?? 0,
    nextRetryAt: projection.nextRetryAt ?? null,
    replayable: projection.replayable,
    updatedAt: projection.updatedAt,
  };
  return OperationTimelineEntrySchema.parse(entry);
}

function normalizeStatus(status: string): OperationStatus {
  const known: OperationStatus[] = [
    'pending',
    'running',
    'succeeded',
    'skipped',
    'failed',
    'retryable',
    'dead_letter',
    'cancelled',
  ];
  return known.includes(status as OperationStatus) ? (status as OperationStatus) : 'failed';
}

export { OperationTimelineEntrySchema };
export type { OperationSourceType, OperationStatus, OperationTimelineEntry };
