import type { PrismaClient } from '@memoflow/database';
import {
  ExternalMutationError,
  runExternalMutation,
  type ExternalMutationAuthority,
} from '@memoflow/database/transaction';
import {
  RoutineAgentCreateSchema,
  RoutineAgentPersistedReceiptSchema,
} from '@memoflow/routine-contracts';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { asInstant, createRecurrenceEngine } from '@memoflow/time';
import { createRoutinePrismaRepositories } from './prisma';
import { createRoutineCoachCommandService } from '../application/services/routine-coach-command.service';
import { createInMemoryRoutineRuntimeContextStore } from '../runtime/routine-runtime-context';
import { createRoutineScheduleChangedNotifier } from './routine-schedule/routine-override-change-notifier';
import { nextWallClockOccurrence, createWallClockTrigger } from '../domain/routine';

/** Hosted owner write: facts and exact result commit together; projection runs after commit. */
export function createRoutinePrismaAgentMutations(
  db: PrismaClient,
  options: {
    now?: () => number;
    onScheduleChanged?: (input: { identityId: string; routineId: string }) => void | Promise<void>;
  } = {},
) {
  const notify = options.onScheduleChanged ?? createRoutineScheduleChangedNotifier();
  const engine = createRecurrenceEngine();
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
          const at = (options.now ?? Date.now)();
          const { startDate, ...wallClock } = parsed.trigger;
          const trigger = createWallClockTrigger({
            ...wallClock,
            recurrence: {
              startDate,
              frequency: 'daily',
              interval: 1,
              byWeekday: [],
              count: 1,
              until: null,
            },
          });
          const scheduledFor = nextWallClockOccurrence(engine, trigger, asInstant(at));
          if (scheduledFor === null || Number(scheduledFor) > at + 366 * 86400000)
            throw new ExternalMutationError('VALIDATION_ERROR');
          const repositories = createRoutinePrismaRepositories(tx);
          const owner = createRoutineCoachCommandService({
            ...repositories,
            runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
            temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
            occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
            onScheduleChanged: (event) => {
              changed.push(event);
            },
          });
          const routine = await owner
            .createRoutine({
              identityId: cx.identityId,
              name: parsed.name,
              description: parsed.description,
              trigger,
              profileIds: [],
              at,
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
      // A failed event flush leaves committed truth available to startup repair.
      for (const event of changed) {
        try {
          await notify(event);
        } catch {
          /* Durable projection repair enumerates Routine definitions. */
        }
      }
      return receipt;
    },
  };
}
