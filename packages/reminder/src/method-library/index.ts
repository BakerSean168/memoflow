/**
 * Curated Routine method library (ROUTINE-5302).
 *
 * This catalog is product configuration metadata, not runtime state.  Methods
 * point at the runtime they require and expose only parameters the user is
 * expected to tune.  The deterministic Routine/Protocol runtimes remain the
 * sole execution authority.
 */

export const ROUTINE_METHOD_IDS = [
  'stand-and-move',
  '20-20-20',
  'drink-water',
  'sleep-wind-down',
  '50-10-protocol',
  'pomodoro',
] as const;

export type RoutineMethodId = (typeof ROUTINE_METHOD_IDS)[number];
export type RoutineMethodType = 'ambient-routine' | 'focus-protocol';
export type RoutineMethodRuntimeRequirement = 'WallClock' | 'Protocol';
export type RoutineMethodInterventionDefault = 'Gentle' | 'Guided';
export type RoutineMethodEditableParameter =
  | 'intervalMinutes'
  | 'fixedTime'
  | 'activeHours'
  | 'focusMinutes'
  | 'breakMinutes'
  | 'cycles'
  | 'longBreakEveryCycles'
  | 'longBreakMinutes';

export interface RoutineMethodRecommendedParameters {
  readonly intervalMinutes?: number;
  readonly fixedTime?: string;
  readonly focusMinutes?: number;
  readonly breakMinutes?: number;
  readonly cycles?: number;
  readonly longBreakEveryCycles?: number;
  readonly longBreakMinutes?: number;
}

/**
 * A transport-neutral preset that the existing Routine configuration UI can
 * project into CreateReminderTemplateReq.  Protocol methods intentionally do
 * not expose this preset: they must use ProtocolDefinition/ProtocolSession.
 */
export interface RoutineMethodTemplatePreset {
  readonly title: string;
  readonly description: string;
  readonly trigger:
    | { readonly type: 'Interval'; readonly intervalMinutes: number }
    | { readonly type: 'FixedTime'; readonly fixedTime: string };
  readonly importanceLevel: 'Moderate' | 'Important';
  readonly icon: string;
  readonly tags: readonly string[];
}

export interface RoutineMethodRecord {
  readonly id: RoutineMethodId;
  readonly name: string;
  readonly summary: string;
  readonly methodType: RoutineMethodType;
  readonly runtimeRequirement: RoutineMethodRuntimeRequirement;
  readonly interventionDefault: RoutineMethodInterventionDefault;
  readonly recommendedParameters: RoutineMethodRecommendedParameters;
  readonly editableParameters: readonly RoutineMethodEditableParameter[];
  readonly sourceNote: string;
  readonly templatePreset: RoutineMethodTemplatePreset | null;
}

function ambient(input: Omit<RoutineMethodRecord, 'methodType' | 'runtimeRequirement'>): RoutineMethodRecord {
  return Object.freeze({ ...input, methodType: 'ambient-routine', runtimeRequirement: 'WallClock' });
}

function protocol(input: Omit<RoutineMethodRecord, 'methodType' | 'runtimeRequirement' | 'templatePreset'>): RoutineMethodRecord {
  return Object.freeze({
    ...input,
    methodType: 'focus-protocol',
    runtimeRequirement: 'Protocol',
    templatePreset: null,
  });
}

export const ROUTINE_METHOD_CATALOG: readonly RoutineMethodRecord[] = Object.freeze([
  ambient({
    id: 'stand-and-move',
    name: 'Stand & Move',
    summary: 'Interrupt long sitting periods with a short stand-and-move prompt.',
    interventionDefault: 'Gentle',
    recommendedParameters: { intervalMinutes: 50 },
    editableParameters: ['intervalMinutes', 'activeHours'],
    sourceNote: 'Work-break pattern inspired by mature break-reminder products; not medical advice.',
    templatePreset: {
      title: 'Stand & Move',
      description: 'Stand up, change posture, and move briefly before returning to work.',
      trigger: { type: 'Interval', intervalMinutes: 50 },
      importanceLevel: 'Moderate',
      icon: 'mdi-walk',
      tags: ['movement', 'break'],
    },
  }),
  ambient({
    id: '20-20-20',
    name: '20-20-20',
    summary: 'Every 20 minutes, look at something farther away for a short visual break.',
    interventionDefault: 'Gentle',
    recommendedParameters: { intervalMinutes: 20 },
    editableParameters: ['intervalMinutes', 'activeHours'],
    sourceNote: 'Common eye-break heuristic; users should adapt it to their own context.',
    templatePreset: {
      title: '20-20-20 eye break',
      description: 'Pause close-up work and look farther away for a short visual reset.',
      trigger: { type: 'Interval', intervalMinutes: 20 },
      importanceLevel: 'Moderate',
      icon: 'mdi-eye-outline',
      tags: ['vision', 'break'],
    },
  }),
  ambient({
    id: 'drink-water',
    name: 'Drink Water',
    summary: 'Use a low-friction periodic prompt to remember hydration during the day.',
    interventionDefault: 'Gentle',
    recommendedParameters: { intervalMinutes: 60 },
    editableParameters: ['intervalMinutes', 'activeHours'],
    sourceNote: 'General reminder pattern only; no intake target is prescribed by MemoFlow.',
    templatePreset: {
      title: 'Drink Water',
      description: 'Take a hydration break when it fits your current context.',
      trigger: { type: 'Interval', intervalMinutes: 60 },
      importanceLevel: 'Moderate',
      icon: 'mdi-cup-water',
      tags: ['hydration'],
    },
  }),
  ambient({
    id: 'sleep-wind-down',
    name: 'Sleep Wind-down',
    summary: 'Create a fixed evening cue for a repeatable pre-sleep wind-down routine.',
    interventionDefault: 'Gentle',
    recommendedParameters: { fixedTime: '22:30' },
    editableParameters: ['fixedTime'],
    sourceNote: 'Behavioral wind-down cue; schedule should be adapted to the user’s sleep plan.',
    templatePreset: {
      title: 'Sleep Wind-down',
      description: 'Start the evening wind-down routine and reduce stimulating activities.',
      trigger: { type: 'FixedTime', fixedTime: '22:30' },
      importanceLevel: 'Important',
      icon: 'mdi-weather-night',
      tags: ['sleep'],
    },
  }),
  protocol({
    id: '50-10-protocol',
    name: '50/10 Protocol',
    summary: 'Alternate 50-minute focus phases with 10-minute breaks.',
    interventionDefault: 'Guided',
    recommendedParameters: { focusMinutes: 50, breakMinutes: 10, cycles: 4 },
    editableParameters: ['focusMinutes', 'breakMinutes', 'cycles'],
    sourceNote: 'Generic work/break protocol; deterministic timing is owned by ProtocolSession runtime.',
  }),
  protocol({
    id: 'pomodoro',
    name: 'Pomodoro',
    summary: 'Use 25-minute focus cycles with short breaks and a longer break after four cycles.',
    interventionDefault: 'Guided',
    recommendedParameters: {
      focusMinutes: 25,
      breakMinutes: 5,
      cycles: 4,
      longBreakEveryCycles: 4,
      longBreakMinutes: 15,
    },
    editableParameters: [
      'focusMinutes',
      'breakMinutes',
      'cycles',
      'longBreakEveryCycles',
      'longBreakMinutes',
    ],
    sourceNote: 'Pomodoro-style focus protocol; MemoFlow owns the implementation and runtime state machine.',
  }),
]);

export function findRoutineMethod(id: RoutineMethodId): RoutineMethodRecord {
  const method = ROUTINE_METHOD_CATALOG.find((candidate) => candidate.id === id);
  if (!method) throw new TypeError(`Unknown Routine method '${id}'`);
  return method;
}

export function getRoutineMethodTemplatePreset(
  id: RoutineMethodId,
): RoutineMethodTemplatePreset | null {
  return findRoutineMethod(id).templatePreset;
}
