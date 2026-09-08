import type { SchedulingReconcileReceipt } from './contracts';

export class SchedulingReconcileError extends Error {
  readonly cause?: unknown;

  constructor(
    public readonly receipt: SchedulingReconcileReceipt,
    options?: { readonly cause?: unknown },
  ) {
    super(receipt.failure?.message ?? 'Scheduling reconcile failed.');
    this.name = 'SchedulingReconcileError';
    this.cause = options?.cause;
  }
}
