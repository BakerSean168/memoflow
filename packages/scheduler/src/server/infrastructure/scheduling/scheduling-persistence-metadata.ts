import type { SchedulingReconcileReceipt } from '@memoflow/contracts/schedule';
import type { ScheduleTask } from '../../domain/aggregates/schedule-task';

export const SCHEDULING_ENVELOPE_FIELD = '__memoflowScheduling';
export const SCHEDULING_ENVELOPE_VERSION = 1 as const;

export interface SchedulingPersistenceEnvelope {
  readonly schemaVersion: typeof SCHEDULING_ENVELOPE_VERSION;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly schedulingKey: string;
  readonly handlerKey: string;
  readonly originalRunAt: number;
  readonly payloadVersion: number;
  readonly sourceRevision: number | string | null;
  readonly fingerprint: string;
}

export interface SchedulingPayloadEnvelope extends Record<string, unknown> {
  readonly [SCHEDULING_ENVELOPE_FIELD]: SchedulingPersistenceEnvelope;
  readonly payload: unknown;
}

export interface SchedulingPersistenceMetadata {
  readonly schedulingKey: string | null;
  readonly ownerType: string | null;
  readonly ownerId: string | null;
  readonly handlerKey: string | null;
  readonly payloadVersion: number | null;
  readonly sourceRevision: string | null;
}

function isSourceRevision(value: unknown): value is number | string | null {
  return value === null || typeof value === 'number' || typeof value === 'string';
}

export function readSchedulingPayloadEnvelope(task: ScheduleTask): SchedulingPayloadEnvelope | null {
  const payload = task.metadata.toDTO().payload;
  const raw = payload[SCHEDULING_ENVELOPE_FIELD];
  if (!raw || typeof raw !== 'object') return null;

  const envelope = raw as Partial<SchedulingPersistenceEnvelope>;
  if (
    envelope.schemaVersion !== SCHEDULING_ENVELOPE_VERSION ||
    typeof envelope.ownerType !== 'string' ||
    typeof envelope.ownerId !== 'string' ||
    typeof envelope.schedulingKey !== 'string' ||
    typeof envelope.handlerKey !== 'string' ||
    typeof envelope.originalRunAt !== 'number' ||
    typeof envelope.payloadVersion !== 'number' ||
    !isSourceRevision(envelope.sourceRevision) ||
    typeof envelope.fingerprint !== 'string'
  ) {
    return null;
  }

  return {
    [SCHEDULING_ENVELOPE_FIELD]: envelope as SchedulingPersistenceEnvelope,
    payload: payload.payload,
  };
}

/** Extract first-class neutral scheduling columns without expanding ScheduleTask business state. */
export function schedulingPersistenceMetadata(task: ScheduleTask): SchedulingPersistenceMetadata {
  const envelope = readSchedulingPayloadEnvelope(task)?.[SCHEDULING_ENVELOPE_FIELD];
  if (!envelope) {
    return {
      schedulingKey: null,
      ownerType: null,
      ownerId: null,
      handlerKey: null,
      payloadVersion: null,
      sourceRevision: null,
    };
  }

  return {
    schedulingKey: envelope.schedulingKey,
    ownerType: envelope.ownerType,
    ownerId: envelope.ownerId,
    handlerKey: envelope.handlerKey,
    payloadVersion: envelope.payloadVersion,
    sourceRevision:
      envelope.sourceRevision === null ? null : String(envelope.sourceRevision),
  };
}

export interface SchedulingReconcileReceiptWriter {
  appendSchedulingReconcileReceipt(receipt: SchedulingReconcileReceipt): Promise<void>;
}
