import { createHash, randomUUID } from 'node:crypto';
import { PgBoss, type Db as IDatabase, type JobWithMetadata, type SendOptions } from 'pg-boss';
import type { Prisma, PrismaClient } from '@memoflow/database';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileFailureCode,
  SchedulingReconcileReceipt,
  SchedulingRetryPolicy,
} from '@memoflow/contracts/schedule';
import {
  DuplicateSchedulingKeyError,
  assertSchedulingOwner,
  assertUniqueSchedulingKeys,
  buildSchedulingOwnerKey,
} from '../../src/scheduling';

export const PGBOSS_POC_SCHEMA = 'pgboss_memoflow_poc';
export const PGBOSS_POC_QUEUE = 'memoflow-scheduled-intent-poc';
export const PGBOSS_POC_DLQ = 'memoflow-scheduled-intent-dlq-poc';

export interface PgBossPocPayload {
  readonly ownerKey: string;
  readonly owner: SchedulingOwner;
  readonly schedulingKey: string;
  readonly handlerKey: string;
  readonly runAt: number;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly sourceRevision: number | string | null;
  readonly fingerprint: string;
}

export interface RetryTranslation {
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  readonly retryDelayMax: number;
  readonly exact: boolean;
  readonly gaps: readonly string[];
}

export type ReconcileFailurePoint = 'after-read' | 'after-upsert' | 'after-delete';

export interface PgBossSchedulingPocOptions {
  readonly now?: () => number;
  readonly operationIdFactory?: () => string;
  readonly failureInjector?: (
    point: ReconcileFailurePoint,
    context: { readonly owner: SchedulingOwner; readonly desiredCount: number },
  ) => void | Promise<void>;
}

type PrismaTransaction = Prisma.TransactionClient;
type PgBossJob = JobWithMetadata<PgBossPocPayload>;

function stableJson(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Scheduled payload contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Scheduled payload contains unsupported ${typeof value} value.`);
  }
  if (typeof value === 'bigint') throw new TypeError('Scheduled payload must not contain bigint values.');
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

export function translateRetryPolicy(policy: SchedulingRetryPolicy): RetryTranslation {
  const enabled = policy.enabled ?? true;
  const gaps: string[] = [];
  if (policy.initialDelayMs % 1_000 !== 0 || policy.maxDelayMs % 1_000 !== 0) {
    gaps.push('pg-boss retry delay precision is seconds while MemoFlow retry precision is milliseconds');
  }
  if (policy.backoffMultiplier !== 1 && policy.backoffMultiplier !== 2) {
    gaps.push('pg-boss exposes exponential backoff as a boolean and cannot preserve an arbitrary multiplier');
  }
  return {
    retryLimit: enabled ? policy.maxRetries : 0,
    retryDelay: Math.ceil(policy.initialDelayMs / 1_000),
    retryBackoff: enabled && policy.backoffMultiplier > 1,
    retryDelayMax: Math.ceil(policy.maxDelayMs / 1_000),
    exact: gaps.length === 0,
    gaps,
  };
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

function deterministicJobId(owner: SchedulingOwner, schedulingKey: string): string {
  const digest = createHash('sha256')
    .update('memoflow:pgboss-poc:v1\u0000')
    .update(buildSchedulingOwnerKey(owner))
    .update('\u0000')
    .update(schedulingKey)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mapPriority(priority: ScheduledIntent['priority']): number {
  switch (priority) {
    case 'urgent': return 30;
    case 'high': return 20;
    case 'low': return -10;
    default: return 0;
  }
}

function makePayload(owner: SchedulingOwner, intent: ScheduledIntent): PgBossPocPayload {
  return {
    ownerKey: buildSchedulingOwnerKey(owner),
    owner,
    schedulingKey: intent.schedulingKey,
    handlerKey: intent.handlerKey,
    runAt: intent.runAt,
    payloadVersion: intent.payloadVersion,
    payload: intent.payload,
    sourceRevision: intent.sourceRevision ?? null,
    fingerprint: intentFingerprint(intent),
  };
}

function toSendOptions(owner: SchedulingOwner, intent: ScheduledIntent, db: IDatabase): SendOptions {
  const retry = translateRetryPolicy(normalizedRetryPolicy(intent));
  return {
    id: deterministicJobId(owner, intent.schedulingKey),
    startAfter: new Date(intent.runAt),
    priority: mapPriority(intent.priority),
    retryLimit: retry.retryLimit,
    retryDelay: retry.retryDelay,
    retryBackoff: retry.retryBackoff,
    retryDelayMax: retry.retryDelayMax,
    expireInSeconds:
      intent.timeoutMs === undefined || intent.timeoutMs === null || intent.timeoutMs <= 0
        ? undefined
        : Math.max(1, Math.ceil(intent.timeoutMs / 1_000)),
    deadLetter: PGBOSS_POC_DLQ,
    db,
  };
}

export function createPrismaPgBossDb(tx: PrismaTransaction): IDatabase {
  return {
    async executeSql(text: string, values: unknown[] = []) {
      const rows = await tx.$queryRawUnsafe<unknown[]>(text, ...values);
      return { rows: Array.isArray(rows) ? rows : [] };
    },
  };
}

function isTerminalState(state: string): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

function failureReceipt(
  owner: SchedulingOwner,
  desiredCount: number,
  startedAt: number,
  operationId: string,
  now: () => number,
  code: SchedulingReconcileFailureCode,
  message: string,
  retryable: boolean,
): SchedulingReconcileReceipt {
  return {
    operationId,
    owner,
    status: 'failed',
    desiredCount,
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    unchangedCount: 0,
    startedAt,
    finishedAt: now(),
    failure: { code, message, retryable },
  };
}

/** PoC-only SchedulingPort adapter. Never exported or wired into production hosts. */
export class PgBossSchedulingPocAdapter implements SchedulingPort {
  private readonly now: () => number;
  private readonly operationIdFactory: () => string;

  constructor(
    private readonly boss: PgBoss,
    private readonly prisma: PrismaClient,
    private readonly options: PgBossSchedulingPocOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.operationIdFactory = options.operationIdFactory ?? randomUUID;
  }

  async reconcile(
    owner: SchedulingOwner,
    desired: readonly ScheduledIntent[],
  ): Promise<SchedulingReconcileReceipt> {
    const startedAt = this.now();
    const operationId = this.operationIdFactory();

    try {
      assertSchedulingOwner(owner);
    } catch (error) {
      return failureReceipt(
        owner,
        desired.length,
        startedAt,
        operationId,
        this.now,
        'INVALID_OWNER',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }

    try {
      assertUniqueSchedulingKeys(desired);
    } catch (error) {
      return failureReceipt(
        owner,
        desired.length,
        startedAt,
        operationId,
        this.now,
        error instanceof DuplicateSchedulingKeyError ? 'DUPLICATE_SCHEDULING_KEY' : 'INVALID_INTENT',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }

    try {
      const counts = await this.prisma.$transaction(async (tx) => {
        const db = createPrismaPgBossDb(tx);
        const ownerKey = buildSchedulingOwnerKey(owner);
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          ownerKey,
        );

        const existing = (await this.boss.findJobs<PgBossPocPayload>(PGBOSS_POC_QUEUE, {
          data: { ownerKey },
          db,
        })) as PgBossJob[];
        await this.options.failureInjector?.('after-read', {
          owner,
          desiredCount: desired.length,
        });

        const existingByKey = new Map(existing.map((job) => [job.data.schedulingKey, job]));
        let createdCount = 0;
        let updatedCount = 0;
        let unchangedCount = 0;

        for (const intent of desired) {
          const payload = makePayload(owner, intent);
          const current = existingByKey.get(intent.schedulingKey);
          if (current?.data.fingerprint === payload.fingerprint) {
            unchangedCount += 1;
            continue;
          }
          if (current && isTerminalState(current.state)) {
            const collision = new Error(
              `Persisted terminal schedulingKey cannot be reused with changed semantics: ${intent.schedulingKey}`,
            ) as Error & { code?: SchedulingReconcileFailureCode };
            collision.code = 'PERSISTED_KEY_COLLISION';
            throw collision;
          }

          const result = await this.boss.upsert(
            PGBOSS_POC_QUEUE,
            payload,
            toSendOptions(owner, intent, db),
          );
          if (result.inserted > 0) createdCount += 1;
          else if (result.updated > 0) updatedCount += 1;
        }

        await this.options.failureInjector?.('after-upsert', {
          owner,
          desiredCount: desired.length,
        });

        const desiredKeys = new Set(desired.map((intent) => intent.schedulingKey));
        const staleIds = existing
          .filter((job) => !desiredKeys.has(job.data.schedulingKey))
          .map((job) => job.id);
        let deletedCount = 0;
        if (staleIds.length > 0) {
          await this.boss.deleteJob(PGBOSS_POC_QUEUE, staleIds, { db });
          // pg-boss 12.30 returns affected at runtime but public CommandResponse is empty.
          // Rows are owner-locked in this transaction, so the stale-set size is authoritative here.
          deletedCount = staleIds.length;
        }

        await this.options.failureInjector?.('after-delete', {
          owner,
          desiredCount: desired.length,
        });
        return { createdCount, updatedCount, deletedCount, unchangedCount };
      });

      return {
        operationId,
        owner,
        status: 'succeeded',
        desiredCount: desired.length,
        ...counts,
        startedAt,
        finishedAt: this.now(),
      };
    } catch (error) {
      const candidateCode = (error as { code?: string } | null)?.code;
      const errorCode: SchedulingReconcileFailureCode | undefined =
        candidateCode === 'PERSISTED_KEY_COLLISION' ? candidateCode : undefined;
      return failureReceipt(
        owner,
        desired.length,
        startedAt,
        operationId,
        this.now,
        errorCode ?? 'TRANSACTION_FAILED',
        error instanceof Error ? error.message : String(error),
        errorCode === undefined,
      );
    }
  }

  async removeOwner(owner: SchedulingOwner): Promise<SchedulingReconcileReceipt> {
    return this.reconcile(owner, []);
  }
}
