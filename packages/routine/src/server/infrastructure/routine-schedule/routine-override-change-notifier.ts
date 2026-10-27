import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import type { RoutineScheduleProjectionEventMap } from './routine-schedule-projection-source';

/** Owner-domain notifier used after durable temporary-override changes. */
export function createRoutineOverrideChangedNotifier(): (input: {
  readonly identityId: string;
  readonly routineId: string;
}) => void {
  const publisher = createTypedEventPublisher<RoutineScheduleProjectionEventMap>(eventBus);
  return ({ identityId, routineId }) => {
    publisher.send('routine:override-changed', { identityId, routineId });
  };
}

/**
 * Owner-domain notifier used after persisted Routine definition/Profile/Membership
 * changes that can alter the durable WallClock desired set.
 */
export function createRoutineScheduleChangedNotifier(): (input: {
  readonly identityId: string;
  readonly routineId: string;
}) => void {
  const publisher = createTypedEventPublisher<RoutineScheduleProjectionEventMap>(eventBus);
  return ({ identityId, routineId }) => {
    publisher.send('routine:schedule-changed', { identityId, routineId });
  };
}
