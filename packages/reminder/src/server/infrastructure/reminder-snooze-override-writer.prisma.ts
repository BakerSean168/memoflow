/**
 * Prisma-backed canonical Routine snooze writer.
 *
 * Snooze is temporary Routine runtime state. It persists a
 * `RoutineTemporaryOverride` and then emits `routine:override-changed` so the
 * neutral Scheduler immediately reconciles the Routine's desired occurrence.
 * It never mutates raw ScheduleTask rows directly.
 */

import type { PrismaClient } from '@memoflow/database';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import type { ReminderSnoozeOverrideWriter } from '../application/use-cases/commands/record-reminder-response.use-case';
import { createSnoozeOverride } from '../domain/routine';
import type { RoutineScheduleProjectionEventMap } from './routine-schedule/routine-schedule-projection-source';
import { PrismaRoutineTemporaryOverrideStore } from './routine-schedule/routine-temporary-override-store.prisma';

const routineProjectionEvents = createTypedEventPublisher<RoutineScheduleProjectionEventMap>(eventBus);

export function createReminderSnoozeOverrideWriterPrisma(
  prisma: PrismaClient,
  now: () => number = Date.now,
): ReminderSnoozeOverrideWriter {
  const store = new PrismaRoutineTemporaryOverrideStore(prisma);

  return {
    async snooze(routineId, identityId, durationSeconds): Promise<void> {
      const override = createSnoozeOverride({
        now: now(),
        durationMs: durationSeconds * 1_000,
        reason: 'user reminder snooze',
        source: 'user',
      });
      await store.setRoutineTemporaryOverride({ identityId, routineId, override });
      routineProjectionEvents.send('routine:override-changed', { routineId, identityId });
    },
  };
}
