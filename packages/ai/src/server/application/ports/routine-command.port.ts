import type { ExecutionContext } from '@memoflow/contracts/shared';

export type AIRoutineMethodId =
  | 'stand-and-move'
  | '20-20-20'
  | 'drink-water'
  | 'sleep-wind-down'
  | '50-10-protocol'
  | 'pomodoro';

export type AIProtocolMethodId = Extract<AIRoutineMethodId, '50-10-protocol' | 'pomodoro'>;

export interface AIRoutineCreateInput {
  readonly context: ExecutionContext;
  readonly title: string;
  readonly description?: string;
  readonly methodId?: AIRoutineMethodId;
  readonly trigger?:
    | { readonly type: 'Interval'; readonly intervalMinutes: number }
    | { readonly type: 'FixedTime'; readonly fixedTime: string };
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
