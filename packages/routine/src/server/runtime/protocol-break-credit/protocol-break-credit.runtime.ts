import { asInstant, type Instant } from '@memoflow/time';
import type {
  ProtocolPhaseKind,
  ProtocolPhasePlanEntry,
  ProtocolSessionSnapshot,
  RoutineBreakCreditKind,
} from '../../domain/routine';
import type { ActiveUsageRuntime, ActiveUsageSatisfactionReceipt } from '../active-usage';

export type AmbientBreakRoutineKind = RoutineBreakCreditKind;
export type ProtocolBreakCapability = 'stand' | 'screen-rest' | 'movement';

export const AMBIENT_BREAK_CAPABILITY: Readonly<
  Record<AmbientBreakRoutineKind, ProtocolBreakCapability>
> = {
  Stand: 'stand',
  Eye: 'screen-rest',
  Movement: 'movement',
};

export const PROTOCOL_BREAK_PHASE_CAPABILITIES: Readonly<
  Partial<Record<ProtocolPhaseKind, readonly ProtocolBreakCapability[]>>
> = {
  ShortBreak: ['stand', 'screen-rest', 'movement'],
  LongBreak: ['stand', 'screen-rest', 'movement'],
  Recovery: ['stand', 'screen-rest', 'movement'],
};

export interface AmbientBreakCreditRegistration {
  readonly identityId: string;
  readonly routineId: string;
  readonly kind: AmbientBreakRoutineKind;
  /** Routine-owned minimum acceptable break length; no medical timing is hard-coded here. */
  readonly minimumBreakMs: number;
}

export interface ProtocolBreakCompletionFact {
  readonly factId: string;
  readonly identityId: string;
  readonly sessionId: string;
  readonly protocolId: string;
  readonly phaseKey: string;
  readonly phaseId: string;
  readonly phaseKind: Extract<ProtocolPhaseKind, 'ShortBreak' | 'LongBreak' | 'Recovery'>;
  readonly cycle: number | null;
  readonly breakStartedAt: Instant;
  readonly completedAt: Instant;
  readonly breakDurationMs: number;
  readonly capabilities: readonly ProtocolBreakCapability[];
}

export interface ProtocolAmbientSatisfactionHistory {
  readonly correlationId: string;
  readonly breakFactId: string;
  readonly identityId: string;
  readonly sessionId: string;
  readonly protocolId: string;
  readonly phaseKey: string;
  readonly phaseKind: ProtocolBreakCompletionFact['phaseKind'];
  readonly cycle: number | null;
  readonly routineId: string;
  readonly routineKind: AmbientBreakRoutineKind;
  readonly breakDurationMs: number;
  readonly satisfiedAt: Instant;
  readonly activeUsage: ActiveUsageSatisfactionReceipt;
}

export interface ProtocolBreakCreditReport {
  readonly factId: string;
  readonly duplicate: boolean;
  readonly credited: readonly ProtocolAmbientSatisfactionHistory[];
  readonly skipped: readonly {
    routineId: string;
    reason:
      | 'identity-mismatch'
      | 'incompatible'
      | 'break-too-short'
      | 'routine-not-active-usage'
      | 'no-active-usage-debt';
  }[];
}

export interface ProtocolBreakCreditRuntime {
  /** Optional for compatibility with externally-owned credit sinks. */
  register?(registration: AmbientBreakCreditRegistration): void;
  unregister?(identityId: string, routineId: string): void;
  creditBreak(fact: ProtocolBreakCompletionFact): ProtocolBreakCreditReport;
  listHistory(): ProtocolAmbientSatisfactionHistory[];
}

export interface CreateProtocolBreakCreditRuntimeOptions {
  readonly activeUsage: ActiveUsageRuntime;
  readonly registrations: readonly AmbientBreakCreditRegistration[];
  readonly restoredHistory?: readonly ProtocolAmbientSatisfactionHistory[];
  /** Correlates a satisfied ActiveUsage occurrence with presentation/runtime cleanup. */
  readonly onRoutineSatisfied?: (entry: ProtocolAmbientSatisfactionHistory) => void;
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${field} must be a positive finite number`);
}

function phaseKey(session: ProtocolSessionSnapshot, phase: ProtocolPhasePlanEntry): string {
  return `${phase.cycle ?? 'session'}:${phase.id}:${phase.kind}`;
}

/**
 * Captures the break phase that is about to be completed. Call this from the
 * durable ProtocolSession snapshot immediately before its phase transition.
 */
export function buildProtocolBreakCompletionFact(input: {
  readonly session: ProtocolSessionSnapshot;
  readonly completedAt: Instant | number;
}): ProtocolBreakCompletionFact | null {
  const index = input.session.currentPlanIndex;
  if (index == null || input.session.phaseStartedAt == null) return null;
  const phase = input.session.phasePlan[index];
  if (!phase || !['ShortBreak', 'LongBreak', 'Recovery'].includes(phase.kind)) return null;
  const completedAt = asInstant(Number(input.completedAt));
  const actualElapsedMs = Math.max(0, Number(completedAt) - Number(input.session.phaseStartedAt));
  const breakDurationMs =
    phase.durationMs == null ? actualElapsedMs : Math.min(actualElapsedMs, phase.durationMs);
  const capabilities = PROTOCOL_BREAK_PHASE_CAPABILITIES[phase.kind] ?? [];
  const key = phaseKey(input.session, phase);
  return {
    factId: `${input.session.id}:${key}`,
    identityId: input.session.identityId,
    sessionId: input.session.id,
    protocolId: input.session.protocolId,
    phaseKey: key,
    phaseId: phase.id,
    phaseKind: phase.kind as ProtocolBreakCompletionFact['phaseKind'],
    cycle: phase.cycle,
    breakStartedAt: input.session.phaseStartedAt,
    completedAt,
    breakDurationMs,
    capabilities,
  };
}

export function createProtocolBreakCreditRuntime(
  options: CreateProtocolBreakCreditRuntimeOptions,
): ProtocolBreakCreditRuntime {
  const registrationKeys = new Set<string>();
  const registrations = new Map<string, AmbientBreakCreditRegistration>();
  const register = (registration: AmbientBreakCreditRegistration): void => {
    assertPositiveFinite(registration.minimumBreakMs, 'minimumBreakMs');
    const key = `${registration.identityId}\u0000${registration.routineId}`;
    if (registrationKeys.has(key)) {
      throw new TypeError(
        `Duplicate Ambient break-credit registration '${registration.identityId}:${registration.routineId}'`,
      );
    }
    registrationKeys.add(key);
    registrations.set(key, { ...registration });
  };
  for (const registration of options.registrations) register(registration);
  const history = [...(options.restoredHistory ?? [])].map((entry) => ({
    ...entry,
    activeUsage: { ...entry.activeUsage },
  }));
  const processedFacts = new Set(history.map((entry) => entry.breakFactId));

  return {
    register,
    unregister(identityId, routineId) {
      const key = `${identityId}\u0000${routineId}`;
      if (registrations.delete(key)) registrationKeys.delete(key);
    },
    creditBreak(fact) {
      if (processedFacts.has(fact.factId)) {
        return { factId: fact.factId, duplicate: true, credited: [], skipped: [] };
      }
      if (!fact.factId.trim() || !fact.identityId.trim() || !fact.sessionId.trim()) {
        throw new TypeError('Protocol break fact identity fields must not be empty');
      }
      assertPositiveFinite(fact.breakDurationMs, 'breakDurationMs');
      if (
        !Number.isFinite(Number(fact.breakStartedAt)) ||
        !Number.isFinite(Number(fact.completedAt))
      ) {
        throw new TypeError('Protocol break fact contains invalid Instants');
      }
      const credited: ProtocolAmbientSatisfactionHistory[] = [];
      const skipped: ProtocolBreakCreditReport['skipped'][number][] = [];

      for (const registration of registrations.values()) {
        if (registration.identityId !== fact.identityId) {
          skipped.push({ routineId: registration.routineId, reason: 'identity-mismatch' });
          continue;
        }
        const requiredCapability = AMBIENT_BREAK_CAPABILITY[registration.kind];
        if (!fact.capabilities.includes(requiredCapability)) {
          skipped.push({ routineId: registration.routineId, reason: 'incompatible' });
          continue;
        }
        if (fact.breakDurationMs < registration.minimumBreakMs) {
          skipped.push({ routineId: registration.routineId, reason: 'break-too-short' });
          continue;
        }
        const current = options.activeUsage.getSnapshot(
          registration.identityId,
          registration.routineId,
        );
        if (!current) {
          skipped.push({ routineId: registration.routineId, reason: 'routine-not-active-usage' });
          continue;
        }
        if (current.accumulatedActiveMs <= 0 && !current.thresholdSignaled) {
          skipped.push({ routineId: registration.routineId, reason: 'no-active-usage-debt' });
          continue;
        }
        const activeUsage = options.activeUsage.markSatisfied({
          identityId: registration.identityId,
          routineId: registration.routineId,
          at: fact.completedAt,
        });
        if (!activeUsage) {
          skipped.push({ routineId: registration.routineId, reason: 'routine-not-active-usage' });
          continue;
        }
        const entry: ProtocolAmbientSatisfactionHistory = {
          correlationId: `${fact.factId}->routine:${registration.routineId}:generation:${activeUsage.completedGeneration}`,
          breakFactId: fact.factId,
          identityId: fact.identityId,
          sessionId: fact.sessionId,
          protocolId: fact.protocolId,
          phaseKey: fact.phaseKey,
          phaseKind: fact.phaseKind,
          cycle: fact.cycle,
          routineId: registration.routineId,
          routineKind: registration.kind,
          breakDurationMs: fact.breakDurationMs,
          satisfiedAt: fact.completedAt,
          activeUsage,
        };
        history.push(entry);
        credited.push(entry);
        options.onRoutineSatisfied?.(entry);
      }
      processedFacts.add(fact.factId);
      return { factId: fact.factId, duplicate: false, credited, skipped };
    },

    listHistory() {
      return history.map((entry) => ({ ...entry, activeUsage: { ...entry.activeUsage } }));
    },
  };
}
