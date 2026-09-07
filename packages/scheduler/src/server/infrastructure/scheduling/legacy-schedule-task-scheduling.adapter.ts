import { createHash, randomUUID } from 'node:crypto';
import {
  SourceModule,
  type ScheduleEventMap,
  type TaskPriority,
} from '@memoflow/contracts/schedule';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import type {
  ScheduledIntent,
  ScheduledInvocationContext,
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileFailureCode,
  SchedulingReconcileReceipt,
  SchedulingRetryPolicy,
} from '../../../scheduling';
import {
  DuplicateSchedulingKeyError,
  SchedulingReconcileError,
  assertSchedulingOwner,
  assertUniqueSchedulingKeys,
  buildSchedulingOwnerKey,
} from '../../../scheduling';
import { ScheduleTask } from '../../domain/aggregates/schedule-task';
import type { IScheduleTaskRepository } from '../../domain/repositories/i-schedule-task-repository';
import type { ScheduleTaskSourceExecutor } from '../../application/source-executors/runtime-contract';
import type { ScheduledHandlerRegistry } from '../../../scheduling';
import {
  SCHEDULING_ENVELOPE_FIELD,
  SCHEDULING_ENVELOPE_VERSION,
  readSchedulingPayloadEnvelope,
  type SchedulingPayloadEnvelope,
  type SchedulingPersistenceEnvelope,
  type SchedulingReconcileReceiptWriter,
} from './scheduling-persistence-metadata';

const scheduleEvents =
  createTypedEventPublisher<Pick<ScheduleEventMap, 'schedule:task-deleted'>>(eventBus);

type ReconcileFailurePoint = 'after-read' | 'after-upsert' | 'after-delete';

export interface ScheduleTaskSchedulingAdapterOptions {
  readonly now?: () => number;
  readonly operationIdFactory?: () => string;
  readonly failureInjector?: (
    point: ReconcileFailurePoint,
    context: { readonly owner: SchedulingOwner; readonly desiredCount: number },
  ) => void | Promise<void>;
}

interface ReconcileCounts {
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly deletedCount: number;
  readonly unchangedCount: number;
  readonly deletedTaskIds: readonly string[];
}

class SchedulingAdapterInvariantError extends Error {
  constructor(
    readonly code: SchedulingReconcileFailureCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'SchedulingAdapterInvariantError';
  }
}

const ownerTails = new Map<string, Promise<void>>();

async function withOwnerSerialization<T>(ownerKey: string, work: () => Promise<T>): Promise<T> {
  const previous = ownerTails.get(ownerKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  ownerTails.set(ownerKey, tail);

  await previous;
  try {
    return await work();
  } finally {
    release();
    if (ownerTails.get(ownerKey) === tail) {
      ownerTails.delete(ownerKey);
    }
  }
}

function stableJson(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Scheduled payload contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Scheduled payload contains unsupported ${typeof value} value.`);
  }
  if (typeof value === 'bigint') {
    throw new TypeError('Scheduled payload must not contain bigint values.');
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError('Scheduled payload must not contain cycles.');
    seen.add(value);
    const result = `[${value.map((item) => stableJson(item, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Scheduled payload must not contain cycles.');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Scheduled payload must contain JSON data only.');
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key], seen)}`)
      .join(',')}}`;
    seen.delete(value);
    return result;
  }
  throw new TypeError('Scheduled payload contains an unsupported value.');
}

function normalizedRetryPolicy(intent: ScheduledIntent): Required<SchedulingRetryPolicy> {
  const policy = intent.retryPolicy;
  return {
    enabled: policy?.enabled ?? true,
    maxRetries: policy?.maxRetries ?? 3,
    initialDelayMs: policy?.initialDelayMs ?? 5_000,
    maxDelayMs: policy?.maxDelayMs ?? 60_000,
    backoffMultiplier: policy?.backoffMultiplier ?? 2,
  };
}

function legacyPriority(priority: ScheduledIntent['priority']): TaskPriority {
  switch (priority) {
    case 'low':
      return 'Low';
    case 'high':
      return 'High';
    case 'urgent':
      return 'Urgent';
    default:
      return 'Normal';
  }
}

function intentFingerprint(intent: ScheduledIntent): string {
  return createHash('sha256')
    .update(
      stableJson({
        handlerKey: intent.handlerKey,
        runAt: intent.runAt,
        payloadVersion: intent.payloadVersion,
        payload: intent.payload,
        sourceRevision: intent.sourceRevision ?? null,
        retryPolicy: normalizedRetryPolicy(intent),
        priority: intent.priority ?? 'normal',
        timeoutMs: intent.timeoutMs ?? null,
        observability: {
          name: intent.observability?.name ?? null,
          tags: [...(intent.observability?.tags ?? [])].sort(),
        },
      }),
    )
    .digest('hex');
}

function deterministicTaskId(owner: SchedulingOwner, schedulingKey: string): string {
  const digest = createHash('sha256')
    .update('memoflow:scheduling:v1\u0000')
    .update(buildSchedulingOwnerKey(owner))
    .update('\u0000')
    .update(schedulingKey)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `IScheduleTaskId_${uuid}`;
}

function ownerStorageKey(owner: SchedulingOwner): string {
  return buildSchedulingOwnerKey(owner);
}

function makePayloadEnvelope(
  owner: SchedulingOwner,
  intent: ScheduledIntent,
): SchedulingPayloadEnvelope {
  return {
    [SCHEDULING_ENVELOPE_FIELD]: {
      schemaVersion: SCHEDULING_ENVELOPE_VERSION,
      ownerType: owner.type,
      ownerId: owner.id,
      schedulingKey: intent.schedulingKey,
      handlerKey: intent.handlerKey,
      originalRunAt: intent.runAt,
      payloadVersion: intent.payloadVersion,
      sourceRevision: intent.sourceRevision ?? null,
      fingerprint: intentFingerprint(intent),
    },
    payload: intent.payload,
  };
}

function readPayloadEnvelope(task: ScheduleTask): SchedulingPayloadEnvelope | null {
  return readSchedulingPayloadEnvelope(task);
}

function createLegacyTask(owner: SchedulingOwner, intent: ScheduledIntent): ScheduleTask {
  const retryPolicy = normalizedRetryPolicy(intent);
  const task = ScheduleTask.create({
    id: deterministicTaskId(owner, intent.schedulingKey),
    identityId: owner.identityId,
    name: intent.observability?.name ?? intent.handlerKey,
    description: `Scheduling intent ${intent.schedulingKey}`,
    sourceModule: SourceModule.Custom,
    sourceEntityId: ownerStorageKey(owner),
    schedule: {
      cronExpression: null,
      timezone: 'UTC',
      startDate: new Date(intent.runAt).toISOString(),
      endDate: null,
      // One ScheduledIntent is one logical invocation, but the reliable engine
      // may execute multiple technical retry attempts. Completion/dead-letter
      // makes it terminal; maxExecutions must not suppress retries after attempt 1.
      maxExecutions: null,
    },
    metadata: {
      payload: makePayloadEnvelope(owner, intent),
      tags: ['scheduling:v1', ...(intent.observability?.tags ?? [])],
      priority: legacyPriority(intent.priority),
      timeout: intent.timeoutMs ?? null,
    },
    retryPolicy: {
      enabled: retryPolicy.enabled,
      maxRetries: retryPolicy.maxRetries,
      retryDelay: retryPolicy.initialDelayMs,
      maxRetryDelay: retryPolicy.maxDelayMs,
      backoffMultiplier: retryPolicy.backoffMultiplier,
    },
  });

  // ScheduleConfig intentionally treats a one-shot in the past as exhausted.
  // Reconcile must still restore the exact desired Instant so restart/missed-run
  // recovery can let the existing queue execute it immediately.
  task.updateExecutionInfo({ nextRunAt: new Date(intent.runAt).toISOString() });
  return task;
}

function updateLegacyTask(
  task: ScheduleTask,
  owner: SchedulingOwner,
  intent: ScheduledIntent,
): void {
  const retryPolicy = normalizedRetryPolicy(intent);
  task.updateSchedule({
    cronExpression: null,
    timezone: 'UTC',
    startDate: new Date(intent.runAt).toISOString(),
    endDate: null,
    // Keep technical retries eligible; terminal state closes the logical intent.
    maxExecutions: null,
  });
  task.updateExecutionInfo({ nextRunAt: new Date(intent.runAt).toISOString() });
  task.updateRetryPolicy({
    enabled: retryPolicy.enabled,
    maxRetries: retryPolicy.maxRetries,
    retryDelay: retryPolicy.initialDelayMs,
    maxRetryDelay: retryPolicy.maxDelayMs,
    backoffMultiplier: retryPolicy.backoffMultiplier,
  });
  task.updateMetadata({
    payload: makePayloadEnvelope(owner, intent),
    tags: ['scheduling:v1', ...(intent.observability?.tags ?? [])],
    priority: legacyPriority(intent.priority),
    timeout: intent.timeoutMs ?? null,
  });
}

function isTerminalLegacyTask(task: ScheduleTask): boolean {
  return task.isCompleted() || task.isCancelled() || task.isFailed();
}

function failureCode(error: unknown): { code: SchedulingReconcileFailureCode; retryable: boolean } {
  if (error instanceof SchedulingAdapterInvariantError) {
    return { code: error.code, retryable: error.retryable };
  }
  if (error instanceof TypeError) {
    return { code: 'INVALID_INTENT', retryable: false };
  }
  return { code: 'TRANSACTION_FAILED', retryable: true };
}

export class LegacyScheduleTaskSchedulingAdapter implements SchedulingPort {
  private readonly now: () => number;
  private readonly operationIdFactory: () => string;

  constructor(
    private readonly repository: IScheduleTaskRepository,
    private readonly options: ScheduleTaskSchedulingAdapterOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.operationIdFactory =
      options.operationIdFactory ?? (() => `scheduling-reconcile:${randomUUID()}`);
  }

  reconcile(
    owner: SchedulingOwner,
    desired: readonly ScheduledIntent[],
  ): Promise<SchedulingReconcileReceipt> {
    return this.reconcileInternal(owner, desired);
  }

  removeOwner(owner: SchedulingOwner): Promise<SchedulingReconcileReceipt> {
    return this.reconcileInternal(owner, []);
  }

  private async reconcileInternal(
    owner: SchedulingOwner,
    desired: readonly ScheduledIntent[],
  ): Promise<SchedulingReconcileReceipt> {
    const operationId = this.operationIdFactory();
    const startedAt = this.now();

    const rejectValidation = (code: SchedulingReconcileFailureCode, error: unknown): never => {
      const receipt: SchedulingReconcileReceipt = {
        operationId,
        owner,
        status: 'failed',
        desiredCount: desired.length,
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        unchangedCount: 0,
        startedAt,
        finishedAt: this.now(),
        failure: {
          code,
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      };
      throw new SchedulingReconcileError(receipt, { cause: error });
    };

    try {
      assertSchedulingOwner(owner);
    } catch (error) {
      rejectValidation('INVALID_OWNER', error);
    }

    try {
      assertUniqueSchedulingKeys(desired);
      for (const intent of desired) intentFingerprint(intent);
    } catch (error) {
      rejectValidation(
        error instanceof DuplicateSchedulingKeyError
          ? 'DUPLICATE_SCHEDULING_KEY'
          : 'INVALID_INTENT',
        error,
      );
    }

    const lockKey = buildSchedulingOwnerKey(owner);
    return withOwnerSerialization(lockKey, async () => {
      try {
        const counts = await this.repository.withTransaction(async (txRepository) => {
          const storageKey = ownerStorageKey(owner);
          if (!txRepository.findBySchedulingOwner) {
            throw new Error(
              'Scheduling repository must support first-class owner lookup inside the owner transaction.',
            );
          }
          const existingTasks = await txRepository.findBySchedulingOwner(owner);

          const existingByKey = new Map<
            string,
            { task: ScheduleTask; envelope: SchedulingPersistenceEnvelope }
          >();
          for (const task of existingTasks) {
            const payloadEnvelope = readPayloadEnvelope(task);
            const envelope = payloadEnvelope?.[SCHEDULING_ENVELOPE_FIELD];
            if (!envelope || envelope.ownerType !== owner.type || envelope.ownerId !== owner.id) {
              throw new SchedulingAdapterInvariantError(
                'PERSISTED_KEY_COLLISION',
                `Legacy ScheduleTask ${task.id} collides with owner storage key ${storageKey}.`,
              );
            }
            if (existingByKey.has(envelope.schedulingKey)) {
              throw new SchedulingAdapterInvariantError(
                'PERSISTED_KEY_COLLISION',
                `Multiple persisted ScheduleTasks share schedulingKey ${envelope.schedulingKey}.`,
              );
            }
            existingByKey.set(envelope.schedulingKey, { task, envelope });
          }

          await this.options.failureInjector?.('after-read', {
            owner,
            desiredCount: desired.length,
          });

          let createdCount = 0;
          let updatedCount = 0;
          let unchangedCount = 0;
          const desiredKeys = new Set<string>();
          const toSave: ScheduleTask[] = [];

          for (const intent of desired) {
            desiredKeys.add(intent.schedulingKey);
            const fingerprint = intentFingerprint(intent);
            const existing = existingByKey.get(intent.schedulingKey);
            if (existing) {
              if (existing.envelope.fingerprint === fingerprint) {
                unchangedCount += 1;
                continue;
              }
              if (isTerminalLegacyTask(existing.task)) {
                throw new SchedulingAdapterInvariantError(
                  'PERSISTED_KEY_COLLISION',
                  `Terminal schedulingKey ${intent.schedulingKey} cannot be reused for a changed intent; use a new occurrence key.`,
                );
              }
              updateLegacyTask(existing.task, owner, intent);
              toSave.push(existing.task);
              updatedCount += 1;
              continue;
            }

            const expectedId = deterministicTaskId(owner, intent.schedulingKey);
            const idCollision = await txRepository.findByIdForIdentity(
              owner.identityId,
              expectedId,
            );
            if (idCollision) {
              const collisionEnvelope =
                readPayloadEnvelope(idCollision)?.[SCHEDULING_ENVELOPE_FIELD];
              if (
                !collisionEnvelope ||
                collisionEnvelope.schedulingKey !== intent.schedulingKey ||
                collisionEnvelope.ownerType !== owner.type ||
                collisionEnvelope.ownerId !== owner.id
              ) {
                throw new SchedulingAdapterInvariantError(
                  'PERSISTED_KEY_COLLISION',
                  `Deterministic ScheduleTask id collision for schedulingKey ${intent.schedulingKey}.`,
                );
              }
            }

            toSave.push(createLegacyTask(owner, intent));
            createdCount += 1;
          }

          if (toSave.length > 0) {
            await txRepository.saveBatch(toSave);
          }

          await this.options.failureInjector?.('after-upsert', {
            owner,
            desiredCount: desired.length,
          });

          const stale = [...existingByKey.entries()]
            .filter(([key]) => !desiredKeys.has(key))
            .map(([, value]) => value.task);
          if (stale.length > 0) {
            await txRepository.deleteBatch(
              owner.identityId,
              stale.map((task) => task.id),
            );
          }

          await this.options.failureInjector?.('after-delete', {
            owner,
            desiredCount: desired.length,
          });

          const receipt: SchedulingReconcileReceipt = {
            operationId,
            owner,
            status: 'succeeded',
            desiredCount: desired.length,
            createdCount,
            updatedCount,
            deletedCount: stale.length,
            unchangedCount,
            startedAt,
            finishedAt: this.now(),
          };
          const receiptWriter = txRepository as IScheduleTaskRepository &
            Partial<SchedulingReconcileReceiptWriter>;
          if (!receiptWriter.appendSchedulingReconcileReceipt) {
            throw new Error(
              'Scheduling repository must persist the reconcile receipt inside the owner transaction.',
            );
          }
          await receiptWriter.appendSchedulingReconcileReceipt(receipt);

          return {
            createdCount,
            updatedCount,
            deletedCount: stale.length,
            unchangedCount,
            deletedTaskIds: stale.map((task) => task.id),
            receipt,
          } satisfies ReconcileCounts & { readonly receipt: SchedulingReconcileReceipt };
        });

        // Runtime queue invalidation happens only after the owner transaction commits.
        for (const taskId of counts.deletedTaskIds) {
          scheduleEvents.send('schedule:task-deleted', { taskId });
        }

        return counts.receipt;
      } catch (error) {
        const mapped = failureCode(error);
        const receipt: SchedulingReconcileReceipt = {
          operationId,
          owner,
          status: 'failed',
          desiredCount: desired.length,
          createdCount: 0,
          updatedCount: 0,
          deletedCount: 0,
          unchangedCount: 0,
          startedAt,
          finishedAt: this.now(),
          failure: {
            code: mapped.code,
            message: error instanceof Error ? error.message : String(error),
            retryable: mapped.retryable,
          },
        };
        throw new SchedulingReconcileError(receipt, { cause: error });
      }
    });
  }
}

export function createScheduleTaskSchedulingPort(
  repository: IScheduleTaskRepository,
  options?: ScheduleTaskSchedulingAdapterOptions,
): SchedulingPort {
  return new LegacyScheduleTaskSchedulingAdapter(repository, options);
}

export function toScheduledInvocationContext(
  task: ScheduleTask,
): ScheduledInvocationContext | null {
  const payloadEnvelope = readPayloadEnvelope(task);
  if (!payloadEnvelope) return null;
  const envelope = payloadEnvelope[SCHEDULING_ENVELOPE_FIELD];
  return {
    identityId: String(task.identityId),
    owner: {
      identityId: String(task.identityId),
      type: envelope.ownerType,
      id: envelope.ownerId,
    },
    schedulingKey: envelope.schedulingKey,
    handlerKey: envelope.handlerKey,
    runAt: envelope.originalRunAt,
    payloadVersion: envelope.payloadVersion,
    payload: payloadEnvelope.payload,
    ...(envelope.sourceRevision !== null ? { sourceRevision: envelope.sourceRevision } : {}),
  };
}

export function createHandlerRegistryScheduleTaskSourceExecutor(options: {
  readonly registry: ScheduledHandlerRegistry;
}): ScheduleTaskSourceExecutor {
  return {
    async execute(task) {
      const invocation = toScheduledInvocationContext(task);
      if (!invocation) {
        return {
          nextRunAt: null,
          disposition: 'dead_letter',
          error: 'ScheduleTask has no neutral scheduling envelope.',
          result: {
            schedulingDisposition: 'dead_letter',
            schedulingFailureCode: 'MISSING_SCHEDULING_ENVELOPE',
          },
        };
      }

      const handlerResult = await options.registry.execute(invocation);
      if (handlerResult.status === 'retryable') {
        throw new Error(`[${handlerResult.failure.code}] ${handlerResult.failure.message}`);
      }

      if (handlerResult.status === 'failed' || handlerResult.status === 'dead_letter') {
        return {
          nextRunAt: null,
          disposition: handlerResult.status,
          error: handlerResult.failure.message,
          result: {
            ...(handlerResult.result ?? {}),
            schedulingDisposition: handlerResult.status,
            schedulingFailureCode: handlerResult.failure.code,
            handlerKey: invocation.handlerKey,
            schedulingKey: invocation.schedulingKey,
          },
        };
      }

      if (handlerResult.status === 'skipped') {
        return {
          nextRunAt: null,
          disposition: 'skipped',
          error: handlerResult.reason,
          result: {
            ...(handlerResult.result ?? {}),
            schedulingDisposition: 'skipped',
            handlerKey: invocation.handlerKey,
            schedulingKey: invocation.schedulingKey,
          },
        };
      }

      return {
        nextRunAt: null,
        disposition: 'succeeded',
        result: {
          ...(handlerResult.result ?? {}),
          schedulingDisposition: 'succeeded',
          handlerKey: invocation.handlerKey,
          schedulingKey: invocation.schedulingKey,
        },
      };
    },
  };
}
