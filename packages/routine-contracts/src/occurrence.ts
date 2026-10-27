export const ROUTINE_OCCURRENCE_TRIGGER_KINDS = ['WallClock', 'Elapsed', 'ActiveUsage'] as const;
export type RoutineOccurrenceTriggerKind = (typeof ROUTINE_OCCURRENCE_TRIGGER_KINDS)[number];

export const ROUTINE_OCCURRENCE_RESOLUTION_STATES = [
  'Open',
  'Satisfied',
  'Skipped',
  'Expired',
] as const;
export type RoutineOccurrenceResolutionState =
  (typeof ROUTINE_OCCURRENCE_RESOLUTION_STATES)[number];

export const ROUTINE_OCCURRENCE_RESOLUTION_KINDS = [
  'ExplicitComplete',
  'NaturalBreakCredit',
  'ProtocolBreakCredit',
  'UserSkipped',
  'Expired',
] as const;
export type RoutineOccurrenceResolutionKind = (typeof ROUTINE_OCCURRENCE_RESOLUTION_KINDS)[number];

export const ROUTINE_INTERACTION_ACTIONS = [
  'Acknowledged',
  'Completed',
  'Snoozed',
  'Dismissed',
  'Skipped',
] as const;
export type RoutineInteractionAction = (typeof ROUTINE_INTERACTION_ACTIONS)[number];

