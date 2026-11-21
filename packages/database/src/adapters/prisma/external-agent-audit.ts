import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

/** Already-redacted audit fact; never contains token, tool input or response bodies. */
export interface ExternalAgentAuditRecord {
  readonly identityId?: string;
  readonly credentialId?: string;
  readonly credentialType?: string;
  readonly clientId?: string;
  readonly consentScopesHash?: string;
  readonly effect: string;
  readonly tool: string;
  readonly outcome: string;
  readonly scopeDecision: string;
  readonly requestId: string;
  readonly traceId?: string;
  readonly receiptId?: string;
  readonly replayed?: boolean;
  readonly durationMs: number;
}

export interface ExternalAgentAuditStoreOptions {
  readonly batchSize?: number;
  readonly flushDelayMs?: number;
  readonly maxQueue?: number;
  /** Called with the number of records dropped by a failed batch or a full queue. */
  readonly onDrop?: (count: number) => void;
}

export interface ExternalAgentAuditStore {
  /** Enqueues synchronously; the hot path never awaits the database. */
  record(event: ExternalAgentAuditRecord): void;
  /** Flushes everything queued so far; resolves after the batches settle. */
  flush(): Promise<void>;
  /** Stops accepting records and flushes the remainder. */
  close(): Promise<void>;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_DELAY_MS = 250;
const DEFAULT_MAX_QUEUE = 2000;

function toRow(event: ExternalAgentAuditRecord): Prisma.ExternalAgentAuditEventCreateManyInput {
  return {
    identityId: event.identityId ?? null,
    credentialId: event.credentialId ?? null,
    credentialType: event.credentialType ?? null,
    clientId: event.clientId ?? null,
    consentScopesHash: event.consentScopesHash ?? null,
    effect: event.effect,
    tool: event.tool,
    outcome: event.outcome,
    scopeDecision: event.scopeDecision,
    requestId: event.requestId,
    traceId: event.traceId ?? null,
    receiptId: event.receiptId ?? null,
    replayed: event.replayed ?? null,
    durationMs: Math.max(0, Math.round(event.durationMs)),
  };
}

/**
 * Bounded, batched writer for hosted MCP/edge audit copies. Each accepted event
 * costs one in-memory push; batches land in one INSERT after a short debounce.
 * Batch failure drops that batch (the structured log already retained it) so a
 * database incident can never stall or unboundedly grow the gateway.
 * @param db - Shared Prisma client; the store never owns its lifecycle.
 * @param options - Batch size, debounce delay, queue bound and drop observer.
 * @returns The asynchronous audit store used by the API host.
 */
export function createExternalAgentAuditStore(
  db: PrismaClient,
  options: ExternalAgentAuditStoreOptions = {},
): ExternalAgentAuditStore {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const flushDelayMs = Math.max(0, options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS);
  const maxQueue = Math.max(1, options.maxQueue ?? DEFAULT_MAX_QUEUE);
  const queue: Prisma.ExternalAgentAuditEventCreateManyInput[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let closed = false;

  const drop = (count: number) => {
    if (count > 0) options.onDrop?.(count);
  };

  const writeBatch = async (rows: Prisma.ExternalAgentAuditEventCreateManyInput[]) => {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', '5000', true)`;
        await tx.externalAgentAuditEvent.createMany({ data: rows });
      },
      { timeout: 5000, maxWait: 2000 },
    );
  };

  const drain = (): Promise<void> => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      while (queue.length > 0) {
        const rows = queue.splice(0, batchSize);
        try {
          await writeBatch(rows);
        } catch {
          drop(rows.length);
        }
      }
    })()
      .catch(() => {
        /* writeBatch already reports its own failures; a store failure never escapes. */
      })
      .finally(() => {
        inFlight = null;
        if (!closed && queue.length > 0) schedule();
      });
    return inFlight;
  };

  function schedule() {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, flushDelayMs);
    timer.unref?.();
  }

  return {
    record(event) {
      if (closed) {
        drop(1);
        return;
      }
      queue.push(toRow(event));
      if (queue.length > maxQueue) {
        const overflow = queue.length - maxQueue;
        queue.splice(0, overflow);
        drop(overflow);
      }
      if (queue.length >= batchSize) void drain();
      else schedule();
    },
    flush: drain,
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await drain();
    },
  };
}

export interface ExternalAgentAuditFilter {
  readonly credentialId?: string;
  readonly requestId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
}

export interface ExternalAgentAuditEntry extends ExternalAgentAuditRecord {
  readonly createdAt: Date;
}

export interface ExternalAgentAuditPage {
  readonly items: readonly ExternalAgentAuditEntry[];
  readonly hasMore: boolean;
}

export interface ExternalAgentAuditQueryPort {
  /** Every read is scoped to the caller's identity; foreign ids answer an empty page. */
  list(identityId: string, filter: ExternalAgentAuditFilter): Promise<ExternalAgentAuditPage>;
}

const MAX_PAGE_SIZE = 200;

/**
 * Owner-scoped reader for the persisted audit copy. Filtering by a credential or
 * request id never widens the identity scope, so a foreign id returns no rows.
 * @param db - Shared Prisma client.
 * @returns The bounded query port bound by the API host.
 */
export function createExternalAgentAuditQuery(db: PrismaClient): ExternalAgentAuditQueryPort {
  return {
    async list(identityId, filter) {
      const take = Math.min(Math.max(filter.limit ?? 50, 1), MAX_PAGE_SIZE);
      const rows = await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('statement_timeout', '5000', true)`;
          return tx.externalAgentAuditEvent.findMany({
            where: {
              identityId,
              ...(filter.credentialId ? { credentialId: filter.credentialId } : {}),
              ...(filter.requestId ? { requestId: filter.requestId } : {}),
              ...(filter.from || filter.to
                ? {
                    createdAt: {
                      ...(filter.from ? { gte: filter.from } : {}),
                      ...(filter.to ? { lte: filter.to } : {}),
                    },
                  }
                : {}),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: take + 1,
          });
        },
        { timeout: 5000, maxWait: 2000 },
      );
      return {
        items: rows.slice(0, take).map((row) => ({
          identityId: row.identityId ?? undefined,
          credentialId: row.credentialId ?? undefined,
          credentialType: row.credentialType ?? undefined,
          clientId: row.clientId ?? undefined,
          consentScopesHash: row.consentScopesHash ?? undefined,
          effect: row.effect,
          tool: row.tool,
          outcome: row.outcome,
          scopeDecision: row.scopeDecision,
          requestId: row.requestId,
          traceId: row.traceId ?? undefined,
          receiptId: row.receiptId ?? undefined,
          replayed: row.replayed ?? undefined,
          durationMs: row.durationMs,
          createdAt: row.createdAt,
        })),
        hasMore: rows.length > take,
      };
    },
  };
}
