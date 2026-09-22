import type { SchedulingReconcileReceipt } from './contracts';

export class PersistedSchedulingKeyCollisionError extends Error {
  constructor(public readonly schedulingKey: string) {
    super(
      `Terminal schedulingKey ${schedulingKey} cannot be reused for a changed intent; use a new occurrence key.`,
    );
    this.name = 'PersistedSchedulingKeyCollisionError';
  }
}

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
