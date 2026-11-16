import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import type { PrismaClient } from '@memoflow/database';
import {
  ExternalMutationError,
  runExternalMutation,
  type ExternalMutationAuthority,
} from '@memoflow/database/transaction';
import {
  RoutineAgentCreateSchema,
  RoutineAgentDeleteReceiptSchema,
  RoutineAgentDeleteSchema,
  RoutineAgentOverrideReceiptSchema,
  RoutineAgentOverrideSchema,
  RoutineAgentPauseSchema,
  RoutineAgentPersistedReceiptSchema,
  RoutineAgentUpdateReceiptSchema,
  RoutineAgentUpdateSchema,
} from '@memoflow/routine-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { asInstant, createRecurrenceEngine, type RecurrenceWeekday } from '@memoflow/time';
import { createRoutinePrismaRepositories } from './prisma';
import { createRoutinePowerSyncRepositories } from './powersync';
import { createRoutineCoachCommandService } from '../application/services/routine-coach-command.service';
import { createInMemoryRoutineRuntimeContextStore } from '../runtime/routine-runtime-context';
import {
  createRoutineOverrideChangedNotifier,
  createRoutineScheduleChangedNotifier,
} from './routine-schedule/routine-override-change-notifier';
import { nextWallClockOccurrence, createWallClockTrigger } from '../domain/routine';

/** Temporary overrides are pauses; keep the hosted window short and predictable. */
const MAX_OVERRIDE_WINDOW_MS = 30 * 86400000;

/** Hosted owner write: facts and exact result commit together; projection runs after commit. */
export function createRoutinePrismaAgentMutations(
  db: PrismaClient,
  options: {
    now?: () => number;
    onScheduleChanged?: (input: { identityId: string; routineId: string }) => void | Promise<void>;
    onOverrideChanged?: (input: { identityId: string; routineId: string }) => void | Promise<void>;
  } = {},
) {
  const notifySchedule = options.onScheduleChanged ?? createRoutineScheduleChangedNotifier();
  const notifyOverride = options.onOverrideChanged ?? createRoutineOverrideChangedNotifier();
  const engine = createRecurrenceEngine();
  const at = () => (options.now ?? Date.now)();

  async function flush(
    changed: { identityId: string; routineId: string }[],
    notify: (input: { identityId: string; routineId: string }) => void | Promise<void>,
  ) {
    // A failed event flush leaves committed truth available to startup repair.
    for (const event of changed) {
      try {
        await notify(event);
      } catch {
        /* Durable projection repair enumerates Routine definitions. */
      }
    }
  }

  function ownerFor(
    repositories: ReturnType<typeof createRoutinePrismaRepositories>,
    scheduleEvents: { identityId: string; routineId: string }[],
    overrideEvents: { identityId: string; routineId: string }[],
  ) {
    return createRoutineCoachCommandService({
      ...repositories,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
      occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
      onScheduleChanged: (event) => {
        scheduleEvents.push(event);
      },
      onOverrideChanged: (event) => {
        overrideEvents.push(event);
      },
    });
  }

  return {
    async create(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = RoutineAgentCreateSchema.parse(input);
      const changed: { identityId: string; routineId: string }[] = [];
      const receipt = await runExternalMutation(
        db,
        cx.identityId,
        { ...authority, receiptScope: 'credential' },
        'routine.create.v1',
        parsed,
        RoutineAgentPersistedReceiptSchema,
        async (tx) => {
          const now = at();
          const { startDate, recurrence, ...wallClock } = parsed.trigger;
          const trigger = createWallClockTrigger({
            ...wallClock,
            recurrence: recurrence
              ? {
                  ...recurrence,
                  byWeekday: recurrence.byWeekday as RecurrenceWeekday[],
                }
              : {
                  startDate: startDate!,
                  frequency: 'daily',
                  interval: 1,
                  byWeekday: [],
                  count: 1,
                  until: null,
                },
          });
          const scheduledFor = nextWallClockOccurrence(engine, trigger, asInstant(now));
          if (scheduledFor === null || Number(scheduledFor) > now + 366 * 86400000)
            throw new ExternalMutationError('VALIDATION_ERROR');
          const repositories = createRoutinePrismaRepositories(tx);
          const owner = ownerFor(repositories, changed, []);
          const routine = await owner
            .createRoutine({
              identityId: cx.identityId,
              name: parsed.name,
              description: parsed.description,
              trigger,
              profileIds: [],
              at: now,
            })
            .catch((error: unknown) => {
              if (error instanceof TypeError) throw new ExternalMutationError('VALIDATION_ERROR');
              throw error;
            });
          return {
            result: {
              routine: { id: routine.routineId, name: routine.name, version: routine.version },
              scheduledFor: Number(scheduledFor),
            },
          };
        },
      );
      await flush(changed, notifySchedule);
      return receipt;
    },

    async update(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = RoutineAgentUpdateSchema.parse(input);
      const changed: { identityId: string; routineId: string }[] = [];
      const receipt = await runExternalMutation(
        db,
        cx.identityId,
        { ...authority, receiptScope: 'credential' },
        'routine.update.v1',
        parsed,
        RoutineAgentUpdateReceiptSchema,
        async (tx) => {
          const repositories = createRoutinePrismaRepositories(tx);
          const owner = ownerFor(repositories, changed, []);
          const trigger =
            parsed.trigger === null
              ? null
              : parsed.trigger === undefined
                ? undefined
                : createWallClockTrigger({
                    localTime: parsed.trigger.localTime,
                    timeZone: parsed.trigger.timeZone,
                    recurrence: {
                      ...parsed.trigger.recurrence,
                      byWeekday: parsed.trigger.recurrence.byWeekday as RecurrenceWeekday[],
                    },
                  });
          const routine = await owner.updateRoutine({
            identityId: cx.identityId,
            routineId: parsed.routineId,
            expectedVersion: parsed.expectedVersion,
            ...(parsed.name === undefined ? {} : { name: parsed.name }),
            ...(parsed.description === undefined ? {} : { description: parsed.description }),
            ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
            ...(trigger === undefined ? {} : { trigger }),
            at: at(),
          });
          return {
            result: {
              routine: { id: routine.routineId, name: routine.name, version: routine.version },
            },
          };
        },
      );
      await flush(changed, notifySchedule);
      return receipt;
    },

    async delete(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = RoutineAgentDeleteSchema.parse(input);
      const changed: { identityId: string; routineId: string }[] = [];
      const receipt = await runExternalMutation(
        db,
        cx.identityId,
        { ...authority, receiptScope: 'credential' },
        'routine.delete.v1',
        parsed,
        RoutineAgentDeleteReceiptSchema,
        async (tx) => {
          const repositories = createRoutinePrismaRepositories(tx);
          const existing = await repositories.routineProfileStore.findDefinition({
            identityId: cx.identityId,
            routineId: parsed.routineId,
          });
          if (!existing) throw new ExternalMutationError('NOT_FOUND');
          if (existing.version !== parsed.expectedVersion)
            throw new ExternalMutationError('CONFLICT');
          const owner = ownerFor(repositories, changed, []);
          await owner.deleteRoutine({
            identityId: cx.identityId,
            routineId: parsed.routineId,
            expectedVersion: parsed.expectedVersion,
          });
          return { result: { routineId: parsed.routineId } };
        },
      );
      await flush(changed, notifySchedule);
      return receipt;
    },

    async pause(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = RoutineAgentPauseSchema.parse(input);
      const now = at();
      if (parsed.until <= now || parsed.until - now > MAX_OVERRIDE_WINDOW_MS)
        throw new ExternalMutationError('VALIDATION_ERROR');
      const changed: { identityId: string; routineId: string }[] = [];
      const receipt = await runExternalMutation(
        db,
        cx.identityId,
        { ...authority, receiptScope: 'credential' },
        'routine.pause.v1',
        parsed,
        RoutineAgentOverrideReceiptSchema,
        async (tx) => {
          const repositories = createRoutinePrismaRepositories(tx);
          const owner = ownerFor(repositories, [], changed);
          const result = await owner.setTemporaryOverride({
            identityId: cx.identityId,
            routineId: parsed.routineId,
            snoozeUntil: parsed.until,
            expiresAt: parsed.until,
            reason: parsed.reason,
            source: 'user',
          });
          return {
            result: {
              routineId: result.routineId,
              override: result.override
                ? { routineId: result.routineId, ...result.override }
                : null,
            },
          };
        },
      );
      await flush(changed, notifyOverride);
      return receipt;
    },

    async override(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = RoutineAgentOverrideSchema.parse(input);
      const now = at();
      if (parsed.expiresAt <= now || parsed.expiresAt - now > MAX_OVERRIDE_WINDOW_MS)
        throw new ExternalMutationError('VALIDATION_ERROR');
      const changed: { identityId: string; routineId: string }[] = [];
      const receipt = await runExternalMutation(
        db,
        cx.identityId,
        { ...authority, receiptScope: 'credential' },
        'routine.override.v1',
        parsed,
        RoutineAgentOverrideReceiptSchema,
        async (tx) => {
          const repositories = createRoutinePrismaRepositories(tx);
          const owner = ownerFor(repositories, [], changed);
          const result = await owner
            .setTemporaryOverride({
              identityId: cx.identityId,
              routineId: parsed.routineId,
              snoozeUntil: parsed.snoozeUntil,
              suppressUntil: parsed.suppressUntil,
              overrideIntervalMs: parsed.overrideIntervalMs,
              expiresAt: parsed.expiresAt,
              reason: parsed.reason,
              source: 'user',
            })
            .catch((error: unknown) => {
              if (error instanceof TypeError) throw new ExternalMutationError('VALIDATION_ERROR');
              throw error;
            });
          return {
            result: {
              routineId: result.routineId,
              override: result.override
                ? { routineId: result.routineId, ...result.override }
                : null,
            },
          };
        },
      );
      await flush(changed, notifyOverride);
      return receipt;
    },
  };
}

export interface RoutineAgentMutationAuthority {
  readonly connectionId: string;
  authorize(tx: IElectronDatabaseTransaction): Promise<void>;
}

export class RoutineAgentMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Desktop owner write: facts and exact result commit together in SQLite; triggers ps_crud sync queue. */
export function createRoutinePowerSyncAgentMutations(
  db: IElectronDatabase,
  options: {
    now?: () => number;
    onScheduleChanged?: (input: { identityId: string; routineId: string }) => void | Promise<void>;
    onOverrideChanged?: (input: { identityId: string; routineId: string }) => void | Promise<void>;
  } = {},
) {
  const notifySchedule = options.onScheduleChanged ?? createRoutineScheduleChangedNotifier();
  const notifyOverride = options.onOverrideChanged ?? createRoutineOverrideChangedNotifier();
  const engine = createRecurrenceEngine();
  const at = () => (options.now ?? Date.now)();

  async function flush(
    changed: { identityId: string; routineId: string }[],
    notify: (input: { identityId: string; routineId: string }) => void | Promise<void>,
  ) {
    for (const event of changed) {
      try {
        await notify(event);
      } catch {
        /* Startup repair enumerates Routine definitions. */
      }
    }
  }

  function ownerFor(
    repositories: ReturnType<typeof createRoutinePowerSyncRepositories>,
    scheduleEvents: { identityId: string; routineId: string }[],
    overrideEvents: { identityId: string; routineId: string }[],
  ) {
    return createRoutineCoachCommandService({
      ...repositories,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
      occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
      onScheduleChanged: (event) => {
        scheduleEvents.push(event);
      },
      onOverrideChanged: (event) => {
        overrideEvents.push(event);
      },
    });
  }

  async function mutate<TInput extends { idempotencyKey: string }, TReceipt>(
    input: TInput,
    capability: string,
    cx: ExecutionContext,
    authority: RoutineAgentMutationAuthority,
    schema: z.ZodType<TReceipt>,
    work: (
      tx: IElectronDatabaseTransaction,
      scheduleEvents: { identityId: string; routineId: string }[],
      overrideEvents: { identityId: string; routineId: string }[],
    ) => Promise<TReceipt>,
  ): Promise<TReceipt & { replayed?: boolean }> {
    if (!cx.identityId || !authority.connectionId) throw new RoutineAgentMutationError('FORBIDDEN');
    const receiptId = createHash('sha256')
      .update(
        JSON.stringify([cx.identityId, authority.connectionId, capability, input.idempotencyKey]),
      )
      .digest('hex');
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const scheduleEvents: { identityId: string; routineId: string }[] = [];
    const overrideEvents: { identityId: string; routineId: string }[] = [];

    const receipt = await db.writeTransaction(async (tx) => {
      await authority.authorize(tx);
      const row = await tx.getOptional<{ input_digest: string; result_json: string }>(
        'SELECT input_digest, result_json FROM routine_agent_mutation_receipts WHERE id = ? AND identity_id = ?',
        [receiptId, cx.identityId],
      );
      if (row) {
        if (row.input_digest !== digest)
          throw new RoutineAgentMutationError('IDEMPOTENCY_CONFLICT');
        return {
          ...schema.parse(JSON.parse(row.result_json)),
          replayed: true,
        };
      }

      const result = await work(tx, scheduleEvents, overrideEvents);
      const saved = schema.parse(result);
      await tx.execute(
        'INSERT INTO routine_agent_mutation_receipts (id, identity_id, connection_id, capability, idempotency_key, input_digest, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          receiptId,
          cx.identityId,
          authority.connectionId,
          capability,
          input.idempotencyKey,
          digest,
          JSON.stringify(saved),
          new Date(at()).toISOString(),
        ],
      );
      return saved;
    });

    await flush(scheduleEvents, notifySchedule);
    await flush(overrideEvents, notifyOverride);
    return receipt;
  }

  return {
    async create(input: unknown, cx: ExecutionContext, authority: RoutineAgentMutationAuthority) {
      const parsed = RoutineAgentCreateSchema.parse(input);
      return mutate(
        parsed,
        'routine.create.v1',
        cx,
        authority,
        RoutineAgentPersistedReceiptSchema,
        async (tx, scheduleEvents) => {
          const now = at();
          const { startDate, recurrence, ...wallClock } = parsed.trigger;
          const trigger = createWallClockTrigger({
            ...wallClock,
            recurrence: recurrence
              ? {
                  ...recurrence,
                  byWeekday: recurrence.byWeekday as RecurrenceWeekday[],
                }
              : {
                  startDate: startDate!,
                  frequency: 'daily',
                  interval: 1,
                  byWeekday: [],
                  count: 1,
                  until: null,
                },
          });
          const scheduledFor = nextWallClockOccurrence(engine, trigger, asInstant(now));
          if (scheduledFor === null || Number(scheduledFor) > now + 366 * 86400000)
            throw new RoutineAgentMutationError('VALIDATION_ERROR');
          const repositories = createRoutinePowerSyncRepositories(tx);
          const owner = ownerFor(repositories, scheduleEvents, []);
          const routine = await owner
            .createRoutine({
              identityId: cx.identityId,
              name: parsed.name,
              description: parsed.description,
              trigger,
              profileIds: [],
              at: now,
            })
            .catch((error: unknown) => {
              if (error instanceof TypeError)
                throw new RoutineAgentMutationError('VALIDATION_ERROR');
              throw error;
            });
          const receiptId = createHash('sha256')
            .update(
              JSON.stringify([
                cx.identityId,
                authority.connectionId,
                'routine.create.v1',
                parsed.idempotencyKey,
              ]),
            )
            .digest('hex');
          return {
            receiptId,
            result: {
              routine: { id: routine.routineId, name: routine.name, version: routine.version },
              scheduledFor: Number(scheduledFor),
            },
          };
        },
      );
    },

    async update(input: unknown, cx: ExecutionContext, authority: RoutineAgentMutationAuthority) {
      const parsed = RoutineAgentUpdateSchema.parse(input);
      return mutate(
        parsed,
        'routine.update.v1',
        cx,
        authority,
        RoutineAgentUpdateReceiptSchema,
        async (tx, scheduleEvents) => {
          const repositories = createRoutinePowerSyncRepositories(tx);
          const owner = ownerFor(repositories, scheduleEvents, []);
          const trigger =
            parsed.trigger === null
              ? null
              : parsed.trigger === undefined
                ? undefined
                : createWallClockTrigger({
                    localTime: parsed.trigger.localTime,
                    timeZone: parsed.trigger.timeZone,
                    recurrence: {
                      ...parsed.trigger.recurrence,
                      byWeekday: parsed.trigger.recurrence.byWeekday as RecurrenceWeekday[],
                    },
                  });
          const routine = await owner
            .updateRoutine({
              identityId: cx.identityId,
              routineId: parsed.routineId,
              expectedVersion: parsed.expectedVersion,
              ...(parsed.name === undefined ? {} : { name: parsed.name }),
              ...(parsed.description === undefined ? {} : { description: parsed.description }),
              ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
              ...(trigger === undefined ? {} : { trigger }),
              at: at(),
            })
            .catch((error: unknown) => {
              if (error instanceof TypeError)
                throw new RoutineAgentMutationError('VALIDATION_ERROR');
              if (error && typeof error === 'object' && 'code' in error) {
                const code = String((error as { code: unknown }).code);
                if (code === 'NOT_FOUND') throw new RoutineAgentMutationError('NOT_FOUND');
                if (code === 'CONFLICT') throw new RoutineAgentMutationError('CONFLICT');
              }
              throw error;
            });
          const receiptId = createHash('sha256')
            .update(
              JSON.stringify([
                cx.identityId,
                authority.connectionId,
                'routine.update.v1',
                parsed.idempotencyKey,
              ]),
            )
            .digest('hex');
          return {
            receiptId,
            result: {
              routine: { id: routine.routineId, name: routine.name, version: routine.version },
            },
          };
        },
      );
    },

    async delete(input: unknown, cx: ExecutionContext, authority: RoutineAgentMutationAuthority) {
      const parsed = RoutineAgentDeleteSchema.parse(input);
      return mutate(
        parsed,
        'routine.delete.v1',
        cx,
        authority,
        RoutineAgentDeleteReceiptSchema,
        async (tx, scheduleEvents) => {
          const repositories = createRoutinePowerSyncRepositories(tx);
          const existing = await repositories.routineProfileStore.findDefinition({
            identityId: cx.identityId,
            routineId: parsed.routineId,
          });
          if (!existing) throw new RoutineAgentMutationError('NOT_FOUND');
          if (existing.version !== parsed.expectedVersion)
            throw new RoutineAgentMutationError('CONFLICT');
          const owner = ownerFor(repositories, scheduleEvents, []);
          await owner.deleteRoutine({
            identityId: cx.identityId,
            routineId: parsed.routineId,
            expectedVersion: parsed.expectedVersion,
          });
          const receiptId = createHash('sha256')
            .update(
              JSON.stringify([
                cx.identityId,
                authority.connectionId,
                'routine.delete.v1',
                parsed.idempotencyKey,
              ]),
            )
            .digest('hex');
          return { receiptId, result: { routineId: parsed.routineId } };
        },
      );
    },

    async pause(input: unknown, cx: ExecutionContext, authority: RoutineAgentMutationAuthority) {
      const parsed = RoutineAgentPauseSchema.parse(input);
      const now = at();
      if (parsed.until <= now || parsed.until - now > MAX_OVERRIDE_WINDOW_MS)
        throw new RoutineAgentMutationError('VALIDATION_ERROR');
      return mutate(
        parsed,
        'routine.pause.v1',
        cx,
        authority,
        RoutineAgentOverrideReceiptSchema,
        async (tx, _schedule, overrideEvents) => {
          const repositories = createRoutinePowerSyncRepositories(tx);
          const owner = ownerFor(repositories, [], overrideEvents);
          const result = await owner.setTemporaryOverride({
            identityId: cx.identityId,
            routineId: parsed.routineId,
            snoozeUntil: parsed.until,
            expiresAt: parsed.until,
            reason: parsed.reason,
            source: 'user',
          });
          const receiptId = createHash('sha256')
            .update(
              JSON.stringify([
                cx.identityId,
                authority.connectionId,
                'routine.pause.v1',
                parsed.idempotencyKey,
              ]),
            )
            .digest('hex');
          return {
            receiptId,
            result: {
              routineId: result.routineId,
              override: result.override
                ? { routineId: result.routineId, ...result.override }
                : null,
            },
          };
        },
      );
    },

    async override(input: unknown, cx: ExecutionContext, authority: RoutineAgentMutationAuthority) {
      const parsed = RoutineAgentOverrideSchema.parse(input);
      const now = at();
      if (parsed.expiresAt <= now || parsed.expiresAt - now > MAX_OVERRIDE_WINDOW_MS)
        throw new RoutineAgentMutationError('VALIDATION_ERROR');
      return mutate(
        parsed,
        'routine.override.v1',
        cx,
        authority,
        RoutineAgentOverrideReceiptSchema,
        async (tx, _schedule, overrideEvents) => {
          const repositories = createRoutinePowerSyncRepositories(tx);
          const owner = ownerFor(repositories, [], overrideEvents);
          const result = await owner
            .setTemporaryOverride({
              identityId: cx.identityId,
              routineId: parsed.routineId,
              snoozeUntil: parsed.snoozeUntil,
              suppressUntil: parsed.suppressUntil,
              overrideIntervalMs: parsed.overrideIntervalMs,
              expiresAt: parsed.expiresAt,
              reason: parsed.reason,
              source: 'user',
            })
            .catch((error: unknown) => {
              if (error instanceof TypeError)
                throw new RoutineAgentMutationError('VALIDATION_ERROR');
              throw error;
            });
          const receiptId = createHash('sha256')
            .update(
              JSON.stringify([
                cx.identityId,
                authority.connectionId,
                'routine.override.v1',
                parsed.idempotencyKey,
              ]),
            )
            .digest('hex');
          return {
            receiptId,
            result: {
              routineId: result.routineId,
              override: result.override
                ? { routineId: result.routineId, ...result.override }
                : null,
            },
          };
        },
      );
    },
  };
}
