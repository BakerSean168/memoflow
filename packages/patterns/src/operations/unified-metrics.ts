/**
 * W7 统一指标命名 (B)
 *
 * 把 Notification、Knowledge、Schedule rebuild、Account closure
 * 的 outbox/worker telemetry 接入同一命名约定：
 *   memoflow.<module>.outbox.<state>
 *   memoflow.<module>.worker.<outcome>
 */

export const OPERATION_METRIC_PREFIX = 'memoflow';

export type OperationMetricModule =
  | 'notification'
  | 'knowledge'
  | 'schedule-rebuild'
  | 'account-closure';

export type OutboxState =
  | 'persisted'
  | 'claimed'
  | 'succeeded'
  | 'retried'
  | 'failed'
  | 'dead_letter';

export type WorkerOutcome = 'completed' | 'failed' | 'retried' | 'skipped';

export function outboxMetricKey(module: OperationMetricModule, state: OutboxState): string {
  return `${OPERATION_METRIC_PREFIX}.${module}.outbox.${state}`;
}

export function workerMetricKey(module: OperationMetricModule, outcome: WorkerOutcome): string {
  return `${OPERATION_METRIC_PREFIX}.${module}.worker.${outcome}`;
}

export const OPERATION_OUTBOX_METRIC_KEYS = [
  'persisted',
  'claimed',
  'succeeded',
  'retried',
  'failed',
  'dead_letter',
] as const satisfies readonly OutboxState[];

export const OPERATION_WORKER_METRIC_KEYS = [
  'completed',
  'failed',
  'retried',
  'skipped',
] as const satisfies readonly WorkerOutcome[];
