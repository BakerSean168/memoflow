import { asInstant, type Instant } from '@memoflow/time';
import { evaluateRoutineEligibility, temporaryOverrideAllowsExecution } from '../../domain/routine';
import type { ActiveUsageTrigger, RoutineTemporaryOverride } from '../../domain/routine';
import type { ActivitySensorPort, RoutineActivityEvent } from '../../domain/ports';

export interface ActiveUsageGateState {
  readonly routineEnabled: boolean;
  readonly profileEnabled?: boolean;
  readonly membershipEnabled?: boolean;
  readonly temporaryOverride?: RoutineTemporaryOverride | null;
}

export interface ActiveUsageRoutineRegistration {
  readonly identityId: string;
  readonly routineId: string;
  readonly trigger: ActiveUsageTrigger;
  readonly gates: ActiveUsageGateState;
  readonly restoredSnapshot?: ActiveUsageAccumulatorSnapshot | null;
}

export interface ActiveUsageAccumulatorSnapshot {
  readonly identityId: string;
  readonly routineId: string;
  readonly accumulatedActiveMs: number;
  readonly generation: number;
  readonly thresholdSignaled: boolean;
  readonly lastSatisfiedAt: Instant | null;
}

export interface ActiveUsageOccurrenceDue {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly generation: number;
  readonly requiredActiveMs: number;
  readonly accumulatedActiveMs: number;
  readonly dueAt: Instant;
}

export interface ActiveUsageNaturalBreakSatisfied {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly generation: number;
  readonly idleDurationMs: number;
  readonly satisfiedAt: Instant;
}

export interface ActiveUsageSatisfactionReceipt {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly completedGeneration: number;
  readonly nextGeneration: number;
  readonly previousAccumulatedActiveMs: number;
  readonly satisfiedAt: Instant;
}

export interface ActiveUsageRuntime {
  readonly isStarted: boolean;
  registerRoutine(input: ActiveUsageRoutineRegistration): void;
  unregisterRoutine(identityId: string, routineId: string): void;
  updateGates(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly gates: ActiveUsageGateState;
    readonly at?: Instant | number;
  }): void;
  markSatisfied(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly at?: Instant | number;
  }): ActiveUsageSatisfactionReceipt | null;
  /** Re-arm the same generation when durable occurrence creation failed. */
  rearmOccurrence(identityId: string, routineId: string): void;
  getSnapshot(identityId: string, routineId: string): ActiveUsageAccumulatorSnapshot | null;
  listSnapshots(): ActiveUsageAccumulatorSnapshot[];
  start(): void;
  stop(): void;
  /** Deterministic clock seam used by the local timer and tests. */
  advance(at?: Instant | number): void;
}

export interface CreateActiveUsageRuntimeOptions {
  readonly activitySensor: ActivitySensorPort;
  readonly onOccurrenceDue: (event: ActiveUsageOccurrenceDue) => void;
  readonly onNaturalBreakSatisfied?: (event: ActiveUsageNaturalBreakSatisfied) => void;
  readonly now?: () => number;
  readonly tickIntervalMs?: number;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}

interface Lane {
  identityId: string;
  routineId: string;
  trigger: ActiveUsageTrigger;
  gates: ActiveUsageGateState;
  accumulatedActiveMs: number;
  generation: number;
  thresholdSignaled: boolean;
  lastSatisfiedAt: Instant | null;
}

function laneKey(identityId: string, routineId: string): string {
  return `${identityId}\u0000${routineId}`;
}

function occurrenceKey(lane: Lane): string {
  return `routine:${lane.routineId}:active-usage:${lane.generation}`;
}

function normalizeRestoredSnapshot(
  input: ActiveUsageRoutineRegistration,
): Pick<Lane, 'accumulatedActiveMs' | 'generation' | 'thresholdSignaled' | 'lastSatisfiedAt'> {
  const restored = input.restoredSnapshot;
  if (!restored) {
    return {
      accumulatedActiveMs: 0,
      generation: 1,
      thresholdSignaled: false,
      lastSatisfiedAt: null,
    };
  }
  if (restored.identityId !== input.identityId || restored.routineId !== input.routineId) {
    throw new TypeError('ActiveUsage restored snapshot ownership mismatch');
  }
  if (!Number.isFinite(restored.accumulatedActiveMs) || restored.accumulatedActiveMs < 0) {
    throw new TypeError('ActiveUsage accumulatedActiveMs must be a non-negative finite number');
  }
  if (!Number.isInteger(restored.generation) || restored.generation <= 0) {
    throw new TypeError('ActiveUsage generation must be a positive integer');
  }
  return {
    accumulatedActiveMs: Math.min(restored.accumulatedActiveMs, input.trigger.requiredActiveMs),
    generation: restored.generation,
    thresholdSignaled: restored.thresholdSignaled,
    lastSatisfiedAt: restored.lastSatisfiedAt,
  };
}

function snapshot(lane: Lane): ActiveUsageAccumulatorSnapshot {
  return {
    identityId: lane.identityId,
    routineId: lane.routineId,
    accumulatedActiveMs: lane.accumulatedActiveMs,
    generation: lane.generation,
    thresholdSignaled: lane.thresholdSignaled,
    lastSatisfiedAt: lane.lastSatisfiedAt,
  };
}

export function createActiveUsageRuntime(
  options: CreateActiveUsageRuntimeOptions,
): ActiveUsageRuntime {
  const now = options.now ?? Date.now;
  const tickIntervalMs = options.tickIntervalMs ?? 1_000;
  if (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0) {
    throw new TypeError('tickIntervalMs must be a positive finite number');
  }
  const setIntervalFn = options.setInterval ?? globalThis.setInterval;
  const clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  const lanes = new Map<string, Lane>();
  let started = false;
  let activityState: 'active' | 'idle' = 'active';
  let lastAdvancedAt: Instant | null = null;
  let unsubscribeActivity: (() => void) | null = null;
  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  const naturalBreakCreditedThisIdle = new Set<string>();

  const resolveAt = (value?: Instant | number): Instant => asInstant(Number(value ?? now()));

  const effectiveEnabled = (lane: Lane, at: Instant): boolean =>
    evaluateRoutineEligibility({
      routineEnabled: lane.gates.routineEnabled,
      profileEnabled: lane.gates.profileEnabled,
      membershipEnabled: lane.gates.membershipEnabled,
      temporaryOverrideAllowsExecution: temporaryOverrideAllowsExecution(
        lane.gates.temporaryOverride ?? null,
        at,
      ),
    }).eligible;

  const eligibleActiveMs = (lane: Lane, from: Instant, to: Instant): number => {
    const staticGates = evaluateRoutineEligibility({
      routineEnabled: lane.gates.routineEnabled,
      profileEnabled: lane.gates.profileEnabled,
      membershipEnabled: lane.gates.membershipEnabled,
      temporaryOverrideAllowsExecution: true,
    });
    if (!staticGates.eligible) return 0;

    const fromMs = Number(from);
    const toMs = Number(to);
    if (toMs <= fromMs) return 0;
    const override = lane.gates.temporaryOverride ?? null;
    if (!override || temporaryOverrideAllowsExecution(override, from)) return toMs - fromMs;

    const blockingEnds = [override.snoozeUntil, override.suppressUntil]
      .filter((value): value is Instant => value != null && Number(value) > fromMs)
      .map(Number);
    const gateReopensAt = Math.min(
      Number(override.expiresAt),
      blockingEnds.length === 0 ? Number(override.expiresAt) : Math.max(...blockingEnds),
    );
    return Math.max(0, toMs - Math.max(fromMs, gateReopensAt));
  };

  const resetSatisfied = (lane: Lane, at: Instant): number => {
    const completedGeneration = lane.generation;
    lane.accumulatedActiveMs = 0;
    lane.generation += 1;
    lane.thresholdSignaled = false;
    lane.lastSatisfiedAt = at;
    return completedGeneration;
  };

  const applyNaturalBreak = (at: Instant, idleDurationMs: number): void => {
    for (const lane of lanes.values()) {
      const policy = lane.trigger.naturalBreakCredit;
      const keyForLane = laneKey(lane.identityId, lane.routineId);
      if (
        !policy ||
        idleDurationMs < policy.idleDurationMs ||
        naturalBreakCreditedThisIdle.has(keyForLane) ||
        lane.accumulatedActiveMs === 0 ||
        !effectiveEnabled(lane, at)
      ) {
        continue;
      }
      const completedGeneration = lane.generation;
      const key = occurrenceKey(lane);
      resetSatisfied(lane, at);
      naturalBreakCreditedThisIdle.add(keyForLane);
      options.onNaturalBreakSatisfied?.({
        identityId: lane.identityId,
        routineId: lane.routineId,
        occurrenceKey: key,
        generation: completedGeneration,
        idleDurationMs,
        satisfiedAt: at,
      });
    }
  };

  const advance = (value?: Instant | number): void => {
    const at = resolveAt(value);
    if (lastAdvancedAt == null) {
      lastAdvancedAt = at;
      return;
    }
    const from = lastAdvancedAt;
    const deltaMs = Math.max(0, Number(at) - Number(from));
    lastAdvancedAt = at;
    if (activityState !== 'active' || deltaMs === 0) return;

    for (const lane of lanes.values()) {
      const laneActiveMs = eligibleActiveMs(lane, from, at);
      if (laneActiveMs === 0) continue;
      lane.accumulatedActiveMs = Math.min(
        lane.trigger.requiredActiveMs,
        lane.accumulatedActiveMs + laneActiveMs,
      );
      if (lane.accumulatedActiveMs >= lane.trigger.requiredActiveMs && !lane.thresholdSignaled) {
        lane.thresholdSignaled = true;
        options.onOccurrenceDue({
          identityId: lane.identityId,
          routineId: lane.routineId,
          occurrenceKey: occurrenceKey(lane),
          generation: lane.generation,
          requiredActiveMs: lane.trigger.requiredActiveMs,
          accumulatedActiveMs: lane.accumulatedActiveMs,
          dueAt: at,
        });
      }
    }
  };

  const onActivityChanged = (event: RoutineActivityEvent): void => {
    if (event.type === 'UserIdle') {
      // The OS reports idle after it has already accumulated idleDurationMs.
      // Stop active accumulation at the actual last-user-input boundary rather
      // than counting the sensor's idle-detection window as active usage.
      advance(asInstant(Number(event.at) - Math.max(0, event.idleDurationMs)));
      activityState = 'idle';
      lastAdvancedAt = event.at;
      if (event.idleDurationMs > 0) applyNaturalBreak(event.at, event.idleDurationMs);
      return;
    }
    advance(event.at);
    if (event.type === 'UserResumed') {
      if (activityState === 'idle') applyNaturalBreak(event.at, event.idleDurationMs);
      naturalBreakCreditedThisIdle.clear();
      activityState = 'active';
      return;
    }
    naturalBreakCreditedThisIdle.clear();
    activityState = 'active';
  };

  return {
    get isStarted() {
      return started;
    },
    registerRoutine(input) {
      const restored = normalizeRestoredSnapshot(input);
      lanes.set(laneKey(input.identityId, input.routineId), {
        identityId: input.identityId,
        routineId: input.routineId,
        trigger: input.trigger,
        gates: input.gates,
        ...restored,
      });
    },
    unregisterRoutine(identityId, routineId) {
      lanes.delete(laneKey(identityId, routineId));
    },
    updateGates(input) {
      advance(input.at);
      const lane = lanes.get(laneKey(input.identityId, input.routineId));
      if (!lane) return;
      lane.gates = input.gates;
    },
    markSatisfied(input) {
      const lane = lanes.get(laneKey(input.identityId, input.routineId));
      if (!lane) return null;
      const satisfiedAt = resolveAt(input.at);
      // Satisfaction is an authoritative reset boundary (natural/protocol break,
      // explicit completion). Do not infer the interval since the last sensor
      // tick as active usage: a protocol break may legitimately keep the OS
      // session "active" while still satisfying the routine. Rebase the local
      // clock so the credited break cannot leak into the next generation.
      if (lastAdvancedAt == null || Number(satisfiedAt) >= Number(lastAdvancedAt)) {
        lastAdvancedAt = satisfiedAt;
      }
      const occurrenceKeyBeforeReset = occurrenceKey(lane);
      const previousAccumulatedActiveMs = lane.accumulatedActiveMs;
      const completedGeneration = resetSatisfied(lane, satisfiedAt);
      return {
        identityId: lane.identityId,
        routineId: lane.routineId,
        occurrenceKey: occurrenceKeyBeforeReset,
        completedGeneration,
        nextGeneration: lane.generation,
        previousAccumulatedActiveMs,
        satisfiedAt,
      };
    },
    rearmOccurrence(identityId, routineId) {
      const lane = lanes.get(laneKey(identityId, routineId));
      if (lane) lane.thresholdSignaled = false;
    },
    getSnapshot(identityId, routineId) {
      const lane = lanes.get(laneKey(identityId, routineId));
      return lane ? snapshot(lane) : null;
    },
    listSnapshots() {
      return [...lanes.values()]
        .sort((a, b) =>
          laneKey(a.identityId, a.routineId).localeCompare(laneKey(b.identityId, b.routineId)),
        )
        .map(snapshot);
    },
    start() {
      if (started) return;
      unsubscribeActivity = options.activitySensor.onActivityChanged(onActivityChanged);
      const current = options.activitySensor.getCurrentActivityState();
      activityState = current.state;
      lastAdvancedAt = resolveAt();
      started = true;
      if (current.state === 'idle' && current.idleDurationMs > 0) {
        applyNaturalBreak(lastAdvancedAt, current.idleDurationMs);
      }
      timer = setIntervalFn(() => advance(), tickIntervalMs);
      timer.unref?.();
    },
    stop() {
      if (!started) return;
      advance();
      started = false;
      unsubscribeActivity?.();
      unsubscribeActivity = null;
      if (timer) clearIntervalFn(timer);
      timer = null;
      lastAdvancedAt = null;
    },
    advance,
  };
}
