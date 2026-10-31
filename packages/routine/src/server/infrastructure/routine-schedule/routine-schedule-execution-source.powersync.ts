import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import type { NotificationRequestedWriterPort } from '@memoflow/notification-contracts';
import { type RoutineOccurrenceCommittedEvent } from '@memoflow/routine-contracts';
import { createRecurrenceEngine, type RecurrenceEnginePort } from '@memoflow/time';
import { createRoutineOccurrenceNotificationWriter } from './routine-occurrence-notification-writer';
import { PowerSyncRoutineOccurrenceStore } from './routine-occurrence-store.powersync';
import { createPowerSyncRoutineScheduleStateReader } from './routine-schedule-state-reader.powersync';
import { PowerSyncRoutineTemporaryOverrideStore } from './routine-temporary-override-store.powersync';
import type { RoutineScheduleExecutionDeps } from './routine-schedule-execution-source';

/** Desktop dependencies for the canonical Routine Scheduler execution lane. */
export function createRoutinePowerSyncScheduleExecutionDeps(
  db: IElectronDatabase,
  options: {
    readonly notificationRequestedWriter: NotificationRequestedWriterPort;
    readonly recurrenceEngine?: RecurrenceEnginePort;
    readonly now?: () => number;
    readonly publishOccurrenceCommitted?: (event: RoutineOccurrenceCommittedEvent) => void;
  },
): RoutineScheduleExecutionDeps {
  return {
    reader: createPowerSyncRoutineScheduleStateReader(db),
    occurrenceStore: new PowerSyncRoutineOccurrenceStore(db),
    notificationWriter: createRoutineOccurrenceNotificationWriter(
      options.notificationRequestedWriter,
    ),
    temporaryOverrideStore: new PowerSyncRoutineTemporaryOverrideStore(db),
    recurrenceEngine: options.recurrenceEngine ?? createRecurrenceEngine(),
    now: options.now,
    publishOccurrenceCommitted: options.publishOccurrenceCommitted,
  };
}
