import { asInstant, type Instant } from '@memoflow/time';
import { evaluateRoutineEligibility, temporaryOverrideAllowsExecution } from '../../domain/routine';
import type { ElapsedTrigger, RoutineTemporaryOverride } from '../../domain/routine';

export interface ElapsedGateState {
  readonly routineEnabled: boolean;
  readonly profileEnabled?: boolean;
  readonly membershipEnabled?: boolean;
  readonly temporaryOverride?: RoutineTemporaryOverride | null;
}

export interface ElapsedRoutineRegistration {
  readonly identityId: string;
  readonly routineId: string;
  readonly trigger: ElapsedTrigger;
  readonly gates: ElapsedGateState;
  /** Durable anchor for routine-activation / last-satisfied. Profile activation is runtime-local. */
  readonly durableAnchorAt?: Instant | number | null;
  readonly durableAnchorRevision?: string | null;
  /** Cold-start generation reconstructed from durable RoutineOccurrence facts. */
  readonly initialGeneration?: number;
  readonly restoredSnapshot?: ElapsedRuntimeSnapshot | null;
}

export interface ElapsedRuntimeSnapshot {
  readonly identityId: string;
  readonly routineId: string;
  readonly anchorAt: Instant | null;
  readonly anchorRevision: string | null;
  readonly generation: number;
  readonly thresholdSignaled: boolean;
  readonly lastSatisfiedAt: Instant | null;
}

export interface ElapsedOccurrenceDue {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly anchorRevision: string;
  readonly generation: number;
  readonly anchorAt: Instant;
  readonly dueAt: Instant;
  readonly durationMs: number;
}

export interface ElapsedSatisfactionReceipt {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string | null;
  readonly previousAnchorRevision: string | null;
  readonly completedGeneration: number;
  readonly nextAnchorRevision: string | null;
  readonly nextGeneration: number;
  readonly satisfiedAt: Instant;
}

export interface ElapsedRuntime {
  readonly isStarted: boolean;
  registerRoutine(input: ElapsedRoutineRegistration): void;
  unregisterRoutine(identityId: string, routineId: string): void;
  updateGates(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly gates: ElapsedGateState;
    readonly at?: Instant | number;
  }): void;
  markSatisfied(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly at?: Instant | number;
  }): ElapsedSatisfactionReceipt | null;
  rearmOccurrence(identityId: string, routineId: string): void;
  getSnapshot(identityId: string, routineId: string): ElapsedRuntimeSnapshot | null;
  listSnapshots(): ElapsedRuntimeSnapshot[];
  start(): void;
  stop(): void;
  advance(at?: Instant | number): void;
}

export interface CreateElapsedRuntimeOptions {
  readonly onOccurrenceDue: (event: ElapsedOccurrenceDue) => void;
  readonly now?: () => number;
  readonly tickIntervalMs?: number;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}

interface Lane {
  identityId: string;
  routineId: string;
  trigger: ElapsedTrigger;
  gates: ElapsedGateState;
  anchorAt: Instant | null;
  anchorRevision: string | null;
  generation: number;
  thresholdSignaled: boolean;
  lastSatisfiedAt: Instant | null;
}

function laneKey(identityId: string, routineId: string): string {
  return `${identityId}\u0000${routineId}`;
}

function staticEnabled(gates: ElapsedGateState): boolean {
  return evaluateRoutineEligibility({
    routineEnabled: gates.routineEnabled,
    profileEnabled: gates.profileEnabled,
    membershipEnabled: gates.membershipEnabled,
    temporaryOverrideAllowsExecution: true,
  }).eligible;
}

function effectiveEnabled(gates: ElapsedGateState, at: Instant): boolean {
  return evaluateRoutineEligibility({
    routineEnabled: gates.routineEnabled,
    profileEnabled: gates.profileEnabled,
    membershipEnabled: gates.membershipEnabled,
    temporaryOverrideAllowsExecution: temporaryOverrideAllowsExecution(
      gates.temporaryOverride ?? null,
      at,
    ),
  }).eligible;
}

function occurrenceKey(lane: Lane): string | null {
  if (lane.anchorRevision == null) return null;
  return `routine:${lane.routineId}:elapsed:${lane.anchorRevision}:${lane.generation}`;
}

function profileAnchor(
  at: Instant,
): Pick<Lane, 'anchorAt' | 'anchorRevision' | 'generation' | 'thresholdSignaled'> {
  return {
    anchorAt: at,
    anchorRevision: `profile-${Number(at)}`,
    generation: 1,
    thresholdSignaled: false,
  };
}

function durableAnchor(input: ElapsedRoutineRegistration): Pick<Lane, 'anchorAt' | 'anchorRevision'> {
  if (input.durableAnchorAt == null || !input.durableAnchorRevision?.trim()) {
    throw new TypeError(
      `Elapsed ${input.trigger.anchor} registration requires a durable anchor and revision`,
    );
  }
  const anchorAt = asInstant(Number(input.durableAnchorAt));
  if (!Number.isFinite(Number(anchorAt))) throw new TypeError('Elapsed durable anchor must be valid');
  return { anchorAt, anchorRevision: input.durableAnchorRevision.trim() };
}

function restoredSnapshot(
  input: ElapsedRoutineRegistration,
): ElapsedRuntimeSnapshot | null {
  const restored = input.restoredSnapshot;
  if (!restored) return null;
  if (restored.identityId !== input.identityId || restored.routineId !== input.routineId) {
    throw new TypeError('Elapsed restored snapshot ownership mismatch');
  }
  if (restored.anchorAt != null && !Number.isFinite(Number(restored.anchorAt))) {
    throw new TypeError('Elapsed restored anchor must be valid');
  }
  if (!Number.isInteger(restored.generation) || restored.generation <= 0) {
    throw new TypeError('Elapsed restored generation must be a positive integer');
  }
  return { ...restored };
}

function snapshot(lane: Lane): ElapsedRuntimeSnapshot {
  return {
    identityId: lane.identityId,
    routineId: lane.routineId,
    anchorAt: lane.anchorAt,
    anchorRevision: lane.anchorRevision,
    generation: lane.generation,
    thresholdSignaled: lane.thresholdSignaled,
    lastSatisfiedAt: lane.lastSatisfiedAt,
  };
}

/**
 * Deterministic local elapsed-time runtime. Unlike ActiveUsage it never consumes
 * activity/idle signals: wall elapsed time is calculated from an explicit
 * business anchor. Durable anchors are reconstructed by the composition layer;
 * profile-activation anchors exist only for the active local profile session.
 */
export function createElapsedRuntime(options: CreateElapsedRuntimeOptions): ElapsedRuntime {
  const now = options.now ?? Date.now;
  const tickIntervalMs = options.tickIntervalMs ?? 1_000;
  if (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0) {
    throw new TypeError('tickIntervalMs must be a positive finite number');
  }
  const setIntervalFn = options.setInterval ?? globalThis.setInterval;
  const clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  const lanes = new Map<string, Lane>();
  let started = false;
  let timer: ReturnType<typeof globalThis.setInterval> | null = null;

  const resolveAt = (value?: Instant | number): Instant => asInstant(Number(value ?? now()));

  const advanceLane = (lane: Lane, at: Instant): void => {
    if (lane.anchorAt == null || lane.anchorRevision == null || lane.thresholdSignaled) return;
    if (!effectiveEnabled(lane.gates, at)) return;
    const dueAt = asInstant(
      Number(lane.anchorAt) + lane.trigger.durationMs * lane.generation,
    );
    if (Number(at) < Number(dueAt)) return;
    lane.thresholdSignaled = true;
    options.onOccurrenceDue({
      identityId: lane.identityId,
      routineId: lane.routineId,
      occurrenceKey: occurrenceKey(lane)!,
      anchorRevision: lane.anchorRevision,
      generation: lane.generation,
      anchorAt: lane.anchorAt,
      dueAt,
      durationMs: lane.trigger.durationMs,
    });
  };

  const advance = (value?: Instant | number): void => {
    const at = resolveAt(value);
    for (const lane of lanes.values()) advanceLane(lane, at);
  };

  return {
    get isStarted() {
      return started;
    },
    registerRoutine(input) {
      if (!input.identityId.trim() || !input.routineId.trim()) {
        throw new TypeError('Elapsed registration ownership fields must not be empty');
      }
      const restored = restoredSnapshot(input);
      let anchorAt: Instant | null = null;
      let anchorRevision: string | null = null;
      let generation = input.initialGeneration ?? 1;
      if (!Number.isInteger(generation) || generation <= 0) {
        throw new TypeError('Elapsed initialGeneration must be a positive integer');
      }
      let thresholdSignaled = false;
      let lastSatisfiedAt = restored?.lastSatisfiedAt ?? null;

      if (input.trigger.anchor === 'profile-activation') {
        if (staticEnabled(input.gates)) {
          if (restored?.anchorAt != null && restored.anchorRevision?.startsWith('profile-')) {
            anchorAt = restored.anchorAt;
            anchorRevision = restored.anchorRevision;
            generation = restored.generation;
            thresholdSignaled = restored.thresholdSignaled;
          } else {
            ({ anchorAt, anchorRevision, generation, thresholdSignaled } = profileAnchor(resolveAt()));
          }
        }
      } else {
        const durable = durableAnchor(input);
        anchorAt = durable.anchorAt;
        anchorRevision = durable.anchorRevision;
        if (restored?.anchorRevision === anchorRevision) {
          generation = restored.generation;
          thresholdSignaled = restored.thresholdSignaled;
          lastSatisfiedAt = restored.lastSatisfiedAt;
        }
      }

      lanes.set(laneKey(input.identityId, input.routineId), {
        identityId: input.identityId,
        routineId: input.routineId,
        trigger: input.trigger,
        gates: input.gates,
        anchorAt,
        anchorRevision,
        generation,
        thresholdSignaled,
        lastSatisfiedAt,
      });
    },
    unregisterRoutine(identityId, routineId) {
      lanes.delete(laneKey(identityId, routineId));
    },
    updateGates(input) {
      const lane = lanes.get(laneKey(input.identityId, input.routineId));
      if (!lane) return;
      const at = resolveAt(input.at);
      advanceLane(lane, at);
      const wasStaticEnabled = staticEnabled(lane.gates);
      lane.gates = input.gates;
      const isStaticEnabled = staticEnabled(lane.gates);
      if (lane.trigger.anchor === 'profile-activation') {
        if (wasStaticEnabled && !isStaticEnabled) {
          lane.anchorAt = null;
          lane.anchorRevision = null;
          lane.generation = 1;
          lane.thresholdSignaled = false;
        } else if (!wasStaticEnabled && isStaticEnabled) {
          Object.assign(lane, profileAnchor(at));
        }
      }
    },
    markSatisfied(input) {
      const lane = lanes.get(laneKey(input.identityId, input.routineId));
      if (!lane) return null;
      const satisfiedAt = resolveAt(input.at);
      const previousOccurrenceKey = occurrenceKey(lane);
      const previousAnchorRevision = lane.anchorRevision;
      const completedGeneration = lane.generation;
      lane.thresholdSignaled = false;
      lane.lastSatisfiedAt = satisfiedAt;

      if (lane.trigger.anchor === 'last-satisfied') {
        lane.anchorAt = satisfiedAt;
        lane.anchorRevision = `satisfied-${Number(satisfiedAt)}`;
        lane.generation = 1;
      } else if (lane.anchorAt != null) {
        // Preserve the activation anchor. A late completion skips already-past
        // interval boundaries instead of converting this trigger into
        // last-satisfied semantics.
        const elapsedSinceAnchor = Math.max(0, Number(satisfiedAt) - Number(lane.anchorAt));
        const nextByClock = Math.floor(elapsedSinceAnchor / lane.trigger.durationMs) + 1;
        lane.generation = Math.max(completedGeneration + 1, nextByClock);
      }

      return {
        identityId: lane.identityId,
        routineId: lane.routineId,
        occurrenceKey: previousOccurrenceKey,
        previousAnchorRevision,
        completedGeneration,
        nextAnchorRevision: lane.anchorRevision,
        nextGeneration: lane.generation,
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
        .sort((a, b) => laneKey(a.identityId, a.routineId).localeCompare(laneKey(b.identityId, b.routineId)))
        .map(snapshot);
    },
    start() {
      if (started) return;
      started = true;
      advance();
      timer = setIntervalFn(() => advance(), tickIntervalMs);
      timer.unref?.();
    },
    stop() {
      if (!started) return;
      advance();
      started = false;
      if (timer) clearIntervalFn(timer);
      timer = null;
    },
    advance,
  };
}
