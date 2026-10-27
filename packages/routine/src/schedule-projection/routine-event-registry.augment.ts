/**
 * ROUTINE-3401: register the Routine schedule-projection events in the shared
 * AppEventRegistry extension seam (`@memoflow/contracts/shared`). Typed event
 * buses (`eventBus`, createTypedEventPublisher/Subscriber) resolve these keys to
 * their real payload types instead of the generic `Record<string, unknown>`
 * fallback, so cross-package routing stays type-safe without moving the
 * ROUTINE payload definitions into the contracts package.
 *
 * Consumers must import this side-effect (the schedule-projection seams do) so
 * the augmentation participates in their TypeScript program.
 */
declare module '@memoflow/contracts/shared' {
  interface AppEventRegistryExtensions {
    'routine:occurrence-committed': import('../server/infrastructure/routine-schedule/routine-schedule-projection-source').RoutineOccurrenceCommittedEvent;
    'routine:override-changed': import('../server/infrastructure/routine-schedule/routine-schedule-projection-source').RoutineOverrideChangedEvent;
    'routine:schedule-changed': import('../server/infrastructure/routine-schedule/routine-schedule-projection-source').RoutineScheduleChangedEvent;
  }
}

export {};
