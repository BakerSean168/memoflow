import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { RecurrenceFrequency, RecurrenceWeekday } from '@memoflow/time';

export type AIProtocolMethodId = '50-10-protocol' | 'pomodoro';

export interface AIWallClockTriggerInput {
  readonly type: 'WallClock';
  readonly timingOwner: 'scheduler';
  readonly localTime: string;
  readonly timeZone: string;
  readonly recurrence: {
    readonly startDate: string;
    readonly frequency: RecurrenceFrequency;
    readonly interval?: number;
    readonly byWeekday?: readonly RecurrenceWeekday[];
    readonly count?: number | null;
    readonly until?: number | null;
  };
}

export interface AIElapsedTriggerInput {
  readonly type: 'Elapsed';
  readonly timingOwner: 'local-runtime';
  readonly durationMs: number;
  readonly anchor?: 'routine-activation' | 'profile-activation' | 'last-satisfied';
}

export interface AIActiveUsageTriggerInput {
  readonly type: 'ActiveUsage';
  readonly timingOwner: 'local-runtime';
  readonly requiredActiveMs: number;
  readonly anchor?: 'profile-activation' | 'last-satisfied';
  readonly naturalBreakCredit?: {
    readonly idleDurationMs: number;
    readonly effect?: 'satisfy-and-reset';
  } | null;
  readonly protocolBreakCredit?: {
    readonly kind: 'Stand' | 'Eye' | 'Movement';
    readonly minimumBreakMs: number;
  } | null;
}

export type AIRoutineTriggerInput =
  AIWallClockTriggerInput | AIElapsedTriggerInput | AIActiveUsageTriggerInput;

export interface AIRoutineCreateInput {
  readonly context: ExecutionContext;
  readonly routineId?: string;
  readonly name: string;
  readonly description?: string;
  readonly trigger: AIRoutineTriggerInput;
  readonly profileIds?: readonly string[];
}

export interface AIRoutineCommandReceipt {
  readonly kind: 'routine' | 'profile' | 'override' | 'protocol';
  readonly id: string;
  readonly status: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** AI-owned command abstraction; host adapters delegate to Reminder owner-domain ports. */
export interface IAIRoutineCommandPort {
  createRoutine(input: AIRoutineCreateInput): Promise<AIRoutineCommandReceipt>;
  setProfileActive(input: {
    readonly context: ExecutionContext;
    readonly profileId: string;
    readonly active: boolean;
  }): Promise<AIRoutineCommandReceipt>;
  setTemporaryOverride(input: {
    readonly context: ExecutionContext;
    readonly routineId: string;
    readonly snoozeUntil?: number | null;
    readonly suppressUntil?: number | null;
    readonly overrideIntervalMs?: number | null;
    readonly expiresAt: number;
    readonly reason: string;
  }): Promise<AIRoutineCommandReceipt>;
  clearTemporaryOverride(input: {
    readonly context: ExecutionContext;
    readonly routineId: string;
  }): Promise<AIRoutineCommandReceipt>;
  startProtocol(input: {
    readonly context: ExecutionContext;
    readonly methodId: AIProtocolMethodId;
    readonly focusMinutes?: number;
    readonly breakMinutes?: number;
    readonly cycles?: number;
    readonly longBreakEveryCycles?: number | null;
    readonly longBreakMinutes?: number | null;
  }): Promise<AIRoutineCommandReceipt>;
  transitionProtocol(input: {
    readonly context: ExecutionContext;
    readonly sessionId: string;
    readonly action: 'pause' | 'resume' | 'end';
  }): Promise<AIRoutineCommandReceipt>;
}
