import { z } from 'zod';

export type FocusWindowSessionState = 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Cancelled';

export type FocusWindowPhaseKind = 'Prepare' | 'Focus' | 'ShortBreak' | 'LongBreak' | 'Recovery';

export interface FocusWindowProjection {
  readonly identityId: string;
  readonly sessionId: string;
  readonly protocolId: string;
  readonly protocolName: string;
  readonly protocolVersion: number;
  readonly state: FocusWindowSessionState;
  readonly version: number;
  readonly phaseId: string | null;
  readonly phaseKind: FocusWindowPhaseKind | null;
  readonly phaseIndex: number | null;
  readonly phaseCount: number;
  readonly cycle: number | null;
  readonly totalCycles: number;
  readonly phaseDurationMs: number | null;
  readonly phaseDeadline: number | null;
  readonly pausedRemainingMs: number | null;
  readonly remainingMs: number | null;
  readonly terminationReason: string | null;
}

export const FocusWindowCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
  z.object({ action: z.literal('end') }).strict(),
  z.object({ action: z.literal('hide') }).strict(),
  z.object({ action: z.literal('collapse'), collapsed: z.boolean() }).strict(),
  z.object({ action: z.literal('always-on-top'), enabled: z.boolean() }).strict(),
]);

export type FocusWindowCommand = z.infer<typeof FocusWindowCommandSchema>;
