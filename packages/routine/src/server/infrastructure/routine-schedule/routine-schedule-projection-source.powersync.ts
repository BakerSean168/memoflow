import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { createRecurrenceEngine, type RecurrenceEnginePort } from '@memoflow/time';
import {
  createRoutineScheduleProjectionSource,
  type RoutineScheduleProjectionSource,
} from './routine-schedule-projection-source';
import { createPowerSyncRoutineScheduleStateReader } from './routine-schedule-state-reader.powersync';

/** Desktop counterpart of the Prisma-hosted Routine projection source. */
export function createRoutinePowerSyncScheduleProjectionSource(
  db: IElectronDatabase,
  options?: { readonly recurrenceEngine?: RecurrenceEnginePort; readonly now?: () => number },
): RoutineScheduleProjectionSource {
  return createRoutineScheduleProjectionSource({
    reader: createPowerSyncRoutineScheduleStateReader(db),
    recurrenceEngine: options?.recurrenceEngine ?? createRecurrenceEngine(),
    now: options?.now,
  });
}
