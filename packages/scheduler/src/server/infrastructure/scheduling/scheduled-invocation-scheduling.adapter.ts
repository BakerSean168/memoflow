import { createHash, randomUUID } from 'node:crypto';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileFailureCode,
  SchedulingReconcileReceipt,
  SchedulingRetryPolicy,
} from '../../../scheduling';
import {
  DuplicateSchedulingKeyError,
  PersistedSchedulingKeyCollisionError,
  SchedulingReconcileError,
  assertSchedulingOwner,
  assertUniqueSchedulingKeys,
  buildSchedulingOwnerKey,
} from '../../../scheduling';
import { ScheduledInvocation } from '../../domain/entities/scheduled-invocation';
import type { IScheduledInvocationRepository } from '../../domain/repositories/i-scheduled-invocation-repository';
import type { ScheduledInvocation as ScheduledInvocationState } from '@memoflow/contracts/schedule';

export interface ScheduledInvocationSchedulingAdapterOptions {
  readonly now?: () => number;
  readonly operationIdFactory?: () => string;
}

function stableJson(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Scheduled payload contains a non-finite number.');
    }
    return JSON.stringify(value);
  }
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

function fingerprint(intent: ScheduledIntent): string {
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

function stateFingerprint(invocation: ScheduledInvocationState): string {
  return fingerprint({
    schedulingKey: invocation.schedulingKey,
    handlerKey: invocation.handlerKey,
    runAt: invocation.runAt,
    payloadVersion: invocation.payloadVersion,
    payload: invocation.payload,
    ...(invocation.sourceRevision === null ? {} : { sourceRevision: invocation.sourceRevision }),
    retryPolicy: invocation.retryPolicy,
    priority: invocation.priority,
    timeoutMs: invocation.timeoutMs,
    observability: {
      ...(invocation.observability.name === null
        ? {}
        : { name: invocation.observability.name }),
      tags: invocation.observability.tags,
    },
  });
}

function deterministicId(owner: SchedulingOwner, schedulingKey: string): string {
  const digest = createHash('sha256')
    .update('memoflow:scheduled-invocation:v1\u0000')
    .update(buildSchedulingOwnerKey(owner))
    .update('\u0000')
    .update(schedulingKey)
    .digest('hex');
  return `scheduled-invocation:${digest}`;
}

function toState(
  owner: SchedulingOwner,
  intent: ScheduledIntent,
  now: number,
): ScheduledInvocationState {
  return ScheduledInvocation.create({
    id: deterministicId(owner, intent.schedulingKey),
    identityId: owner.identityId,
    owner,
    schedulingKey: intent.schedulingKey,
    handlerKey: intent.handlerKey,
    payloadVersion: intent.payloadVersion,
    payload: intent.payload,
    runAt: intent.runAt,
    sourceRevision: intent.sourceRevision ?? null,
    retryPolicy: normalizedRetryPolicy(intent),
    priority: intent.priority ?? 'normal',
    timeoutMs: intent.timeoutMs ?? null,
    name: intent.observability?.name ?? null,
    tags: intent.observability?.tags ?? [],
    now,
  }).toState();
}

function reconcileFailureCode(error: unknown): {
  code: SchedulingReconcileFailureCode;
  retryable: boolean;
} {
  if (error instanceof DuplicateSchedulingKeyError) {
    return { code: 'DUPLICATE_SCHEDULING_KEY', retryable: false };
  }
  if (error instanceof PersistedSchedulingKeyCollisionError) {
    return { code: 'PERSISTED_KEY_COLLISION', retryable: false };
  }
  if (error instanceof TypeError) return { code: 'INVALID_INTENT', retryable: false };
  return { code: 'TRANSACTION_FAILED', retryable: true };
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
    if (ownerTails.get(ownerKey) === tail) ownerTails.delete(ownerKey);
  }
}

export class ScheduledInvocationSchedulingAdapter implements SchedulingPort {
  private readonly now: () => number;
  private readonly operationIdFactory: () => string;

  constructor(
    private readonly repository: IScheduledInvocationRepository,
    options: ScheduledInvocationSchedulingAdapterOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.operationIdFactory = options.operationIdFactory ?? (() => `scheduling-reconcile:${randomUUID()}`);
  }

  reconcile(owner: SchedulingOwner, desired: readonly ScheduledIntent[]): Promise<SchedulingReconcileReceipt> {
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
    try {
      assertSchedulingOwner(owner);
      assertUniqueSchedulingKeys(desired);
      desired.forEach(fingerprint);
    } catch (error) {
      const failure = reconcileFailureCode(error);
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
          code: failure.code,
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      };
      throw new SchedulingReconcileError(receipt, { cause: error });
    }

    return withOwnerSerialization(buildSchedulingOwnerKey(owner), async () => {
      try {
        const receipt = await this.repository.withTransaction(async (repository) => {
          const existing = await repository.findByOwner(owner);
          const existingByKey = new Map(existing.map((invocation) => [invocation.schedulingKey, invocation]));
          let createdCount = 0;
          let updatedCount = 0;
          let unchangedCount = 0;

          for (const intent of desired) {
            const current = existingByKey.get(intent.schedulingKey);
            if (!current) {
              await repository.save(toState(owner, intent, this.now()));
              createdCount += 1;
              continue;
            }
            const reappearedAfterSupersede = current.status === 'superseded';
            if (!reappearedAfterSupersede && stateFingerprint(current) === fingerprint(intent)) {
              unchangedCount += 1;
              continue;
            }
            if (
              current.status === 'succeeded' ||
              current.status === 'skipped' ||
              current.status === 'failed' ||
              current.status === 'dead_letter'
            ) {
              throw new PersistedSchedulingKeyCollisionError(intent.schedulingKey);
            }
            const updated = ScheduledInvocation.load(current);
            updated.applyDesired({
              handlerKey: intent.handlerKey,
              payloadVersion: intent.payloadVersion,
              payload: intent.payload,
              runAt: intent.runAt,
              sourceRevision: intent.sourceRevision ?? null,
              retryPolicy: normalizedRetryPolicy(intent),
              priority: intent.priority ?? 'normal',
              timeoutMs: intent.timeoutMs ?? null,
              name: intent.observability?.name ?? null,
              tags: intent.observability?.tags ?? [],
              now: this.now(),
            });
            await repository.save(updated.toState());
            updatedCount += 1;
          }

          const deletedCount = await repository.supersedeStale(
            owner,
            desired.map((intent) => intent.schedulingKey),
          );
          const receipt: SchedulingReconcileReceipt = {
            operationId,
            owner,
            status: 'succeeded',
            desiredCount: desired.length,
            createdCount,
            updatedCount,
            deletedCount,
            unchangedCount,
            startedAt,
            finishedAt: this.now(),
          };
          await repository.appendSchedulingReconcileReceipt(receipt);
          return receipt;
        });
        return receipt;
      } catch (error) {
        const failure = reconcileFailureCode(error);
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
            code: failure.code,
            message: error instanceof Error ? error.message : String(error),
            retryable: failure.retryable,
          },
        };
        throw new SchedulingReconcileError(receipt, { cause: error });
      }
    });
  }
}

export function createScheduledInvocationSchedulingPort(
  repository: IScheduledInvocationRepository,
  options?: ScheduledInvocationSchedulingAdapterOptions,
): SchedulingPort {
  return new ScheduledInvocationSchedulingAdapter(repository, options);
}
