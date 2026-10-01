import type { RoutineTriggerDto } from '@memoflow/contracts/routine';

export type RoutineEditorTriggerType = 'None' | RoutineTriggerDto['type'];
export type RoutineFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RoutineElapsedAnchor = 'routine-activation' | 'profile-activation' | 'last-satisfied';
export type RoutineActiveAnchor = 'profile-activation' | 'last-satisfied';
