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
