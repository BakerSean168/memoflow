import { randomUUID } from 'node:crypto';
import { asInstant, type Instant } from '@memoflow/time';

export const PROTOCOL_PHASE_KINDS = [
  'Prepare',
  'Focus',
  'ShortBreak',
  'LongBreak',
  'Recovery',
] as const;
export type ProtocolPhaseKind = (typeof PROTOCOL_PHASE_KINDS)[number];
export type ProtocolPhaseRole = 'session-start' | 'cycle' | 'session-end';

export interface ProtocolPhaseDefinition {
  id: string;
  kind: ProtocolPhaseKind;
  role: ProtocolPhaseRole;
  /** null means the phase is advanced explicitly rather than by a deadline. */
  durationMs: number | null;
}

export interface ProtocolCyclePolicy {
  mode: 'fixed';
  cycles: number;
}

export interface ProtocolBreakPolicy {
  afterFinalCycle: 'include' | 'skip';
  /** Replaces cycle ShortBreak phases on every Nth cycle. */
  longBreakEveryCycles: number | null;
  longBreakDurationMs: number | null;
}

export interface ProtocolDefinitionState {
  id: string;
  identityId: string;
  name: string;
  phases: ProtocolPhaseDefinition[];
  cyclePolicy: ProtocolCyclePolicy;
  breakPolicy: ProtocolBreakPolicy;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface ProtocolPhasePlanEntry extends ProtocolPhaseDefinition {
  cycle: number | null;
}

export class ProtocolDefinition {
  private constructor(private readonly state: ProtocolDefinitionState) {}

  static create(input: {
    id?: string;
    identityId: string;
    name: string;
    phases: readonly ProtocolPhaseDefinition[];
    cyclePolicy: ProtocolCyclePolicy;
    breakPolicy?: Partial<ProtocolBreakPolicy>;
    now?: Instant | number;
  }): ProtocolDefinition {
    assertNonEmpty(input.identityId, 'identityId');
    assertNonEmpty(input.name, 'name');
    assertPositiveInteger(input.cyclePolicy.cycles, 'cyclePolicy.cycles');
    validatePhases(input.phases);

    const breakPolicy: ProtocolBreakPolicy = {
      afterFinalCycle: input.breakPolicy?.afterFinalCycle ?? 'skip',
      longBreakEveryCycles: input.breakPolicy?.longBreakEveryCycles ?? null,
      longBreakDurationMs: input.breakPolicy?.longBreakDurationMs ?? null,
    };
    validateBreakPolicy(breakPolicy);
    const now = normalizeInstant(input.now ?? Date.now(), 'now');

    return new ProtocolDefinition({
      id: input.id ?? randomUUID(),
      identityId: input.identityId,
      name: input.name.trim(),
      phases: input.phases.map(clonePhase),
      cyclePolicy: { ...input.cyclePolicy },
      breakPolicy,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(state: ProtocolDefinitionState): ProtocolDefinition {
    validatePhases(state.phases);
    assertPositiveInteger(state.cyclePolicy.cycles, 'cyclePolicy.cycles');
    validateBreakPolicy(state.breakPolicy);
    return new ProtocolDefinition(cloneProtocolDefinitionState(state));
  }

  get id(): string {
    return this.state.id;
  }
  get identityId(): string {
    return this.state.identityId;
  }
  get name(): string {
    return this.state.name;
  }
  get version(): number {
    return this.state.version;
  }

  snapshot(): ProtocolDefinitionState {
    return cloneProtocolDefinitionState(this.state);
  }

  revise(
    input: {
      name?: string;
      phases?: readonly ProtocolPhaseDefinition[];
      cyclePolicy?: ProtocolCyclePolicy;
      breakPolicy?: Partial<ProtocolBreakPolicy>;
    },
    at: Instant | number,
  ): void {
    const name = input.name?.trim() ?? this.state.name;
    assertNonEmpty(name, 'name');
    const phases = input.phases ?? this.state.phases;
    validatePhases(phases);
    const cyclePolicy = input.cyclePolicy ?? this.state.cyclePolicy;
    assertPositiveInteger(cyclePolicy.cycles, 'cyclePolicy.cycles');
    const breakPolicy = { ...this.state.breakPolicy, ...input.breakPolicy };
    validateBreakPolicy(breakPolicy);

    this.state.name = name;
    this.state.phases = phases.map(clonePhase);
    this.state.cyclePolicy = { ...cyclePolicy };
    this.state.breakPolicy = { ...breakPolicy };
    this.state.version += 1;
    this.state.updatedAt = normalizeInstant(at, 'revise.at');
  }

  buildPhasePlan(): ProtocolPhasePlanEntry[] {
    const start = this.state.phases
      .filter((phase) => phase.role === 'session-start')
      .map((phase) => ({ ...clonePhase(phase), cycle: null }));
    const cycleTemplate = this.state.phases.filter((phase) => phase.role === 'cycle');
    const end = this.state.phases
      .filter((phase) => phase.role === 'session-end')
      .map((phase) => ({ ...clonePhase(phase), cycle: null }));

    const cycles: ProtocolPhasePlanEntry[] = [];
    for (let cycle = 1; cycle <= this.state.cyclePolicy.cycles; cycle += 1) {
      const finalCycle = cycle === this.state.cyclePolicy.cycles;
      const longBreak =
        this.state.breakPolicy.longBreakEveryCycles != null &&
        cycle % this.state.breakPolicy.longBreakEveryCycles === 0;

      for (const template of cycleTemplate) {
        if (
          finalCycle &&
          this.state.breakPolicy.afterFinalCycle === 'skip' &&
          isBreakKind(template.kind)
        ) {
          continue;
        }
        if (template.kind === 'ShortBreak' && longBreak) {
          cycles.push({
            ...clonePhase(template),
            kind: 'LongBreak',
            durationMs: this.state.breakPolicy.longBreakDurationMs,
            cycle,
          });
        } else {
          cycles.push({ ...clonePhase(template), cycle });
        }
      }
    }
    return [...start, ...cycles, ...end];
  }
}

export const PROTOCOL_SESSION_STATES = [
  'Idle',
  'Running',
  'Paused',
  'Completed',
  'Cancelled',
] as const;
export type ProtocolSessionState = (typeof PROTOCOL_SESSION_STATES)[number];
export type ProtocolSessionAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'phase-complete'
  | 'end'
  | 'cancel';
export type ProtocolTerminationReason =
  | 'completed'
  | 'user-ended'
  | 'user-cancelled'
  | 'superseded'
  | 'runtime-aborted';

export const PROTOCOL_SESSION_TRANSITIONS = {
  Idle: {
    start: ['Running'],
  },
  Running: {
    pause: ['Paused'],
    'phase-complete': ['Running', 'Completed'],
    end: ['Completed'],
    cancel: ['Cancelled'],
  },
  Paused: {
    resume: ['Running'],
    end: ['Completed'],
    cancel: ['Cancelled'],
  },
  Completed: {},
  Cancelled: {},
} as const satisfies Record<
  ProtocolSessionState,
  Partial<Record<ProtocolSessionAction, readonly ProtocolSessionState[]>>
>;

export interface ProtocolSessionSnapshot {
  id: string;
  identityId: string;
  protocolId: string;
  protocolVersion: number;
  protocolSnapshot: ProtocolDefinitionState;
  phasePlan: ProtocolPhasePlanEntry[];
  state: ProtocolSessionState;
  currentPlanIndex: number | null;
  startedAt: Instant | null;
  phaseStartedAt: Instant | null;
  phaseDeadline: Instant | null;
  pausedAt: Instant | null;
  pausedRemainingMs: number | null;
  accumulatedPauseMs: number;
  endedAt: Instant | null;
  terminationReason: ProtocolTerminationReason | null;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}

export class ProtocolSession {
  private constructor(private state: ProtocolSessionSnapshot) {}

  static create(input: {
    id?: string;
    identityId: string;
    protocol: ProtocolDefinition;
    now?: Instant | number;
  }): ProtocolSession {
    if (input.identityId !== input.protocol.identityId) {
      throw new TypeError('Protocol session identity does not own the protocol definition');
    }
    const now = normalizeInstant(input.now ?? Date.now(), 'now');
    const protocolSnapshot = input.protocol.snapshot();
    const phasePlan = input.protocol.buildPhasePlan();
    if (phasePlan.length === 0) {
      throw new TypeError('Protocol phase plan must not be empty');
    }
    return new ProtocolSession({
      id: input.id ?? randomUUID(),
      identityId: input.identityId,
      protocolId: input.protocol.id,
      protocolVersion: input.protocol.version,
      protocolSnapshot,
      phasePlan,
      state: 'Idle',
      currentPlanIndex: null,
      startedAt: null,
      phaseStartedAt: null,
      phaseDeadline: null,
      pausedAt: null,
      pausedRemainingMs: null,
      accumulatedPauseMs: 0,
      endedAt: null,
      terminationReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(snapshot: ProtocolSessionSnapshot): ProtocolSession {
    validateSessionSnapshot(snapshot);
    return new ProtocolSession(cloneSessionSnapshot(snapshot));
  }

  get id(): string {
    return this.state.id;
  }
  get identityId(): string {
    return this.state.identityId;
  }
  get protocolId(): string {
    return this.state.protocolId;
  }
  get protocolVersion(): number {
    return this.state.protocolVersion;
  }
  get status(): ProtocolSessionState {
    return this.state.state;
  }
  get version(): number {
    return this.state.version;
  }
  get terminationReason(): ProtocolTerminationReason | null {
    return this.state.terminationReason;
  }
  get currentPhase(): ProtocolPhasePlanEntry | null {
    return this.state.currentPlanIndex == null
      ? null
      : { ...this.state.phasePlan[this.state.currentPlanIndex] };
  }
  get currentCycle(): number | null {
    return this.currentPhase?.cycle ?? null;
  }

  start(at: Instant | number): void {
    this.assertTransition('start');
    const now = normalizeInstant(at, 'start.at');
    this.state.state = 'Running';
    this.state.startedAt = now;
    this.enterPhase(0, now);
    this.touch(now);
  }

  pause(at: Instant | number): void {
    const now = normalizeInstant(at, 'pause.at');
    if (this.state.state === 'Running') {
      this.advanceDuePhases(now);
    }
    this.assertTransition('pause');
    this.assertNotBefore(this.state.phaseStartedAt, now, 'pause.at');
    this.state.pausedAt = now;
    this.state.pausedRemainingMs =
      this.state.phaseDeadline == null
        ? null
        : Math.max(0, Number(this.state.phaseDeadline) - Number(now));
    this.state.state = 'Paused';
    this.touch(now);
  }

  resume(at: Instant | number): void {
    this.assertTransition('resume');
    const now = normalizeInstant(at, 'resume.at');
    if (this.state.pausedAt == null) throw new TypeError('Paused session is missing pausedAt');
    this.assertNotBefore(this.state.pausedAt, now, 'resume.at');
    this.state.accumulatedPauseMs += Number(now) - Number(this.state.pausedAt);
    this.state.phaseDeadline =
      this.state.pausedRemainingMs == null
        ? null
        : asInstant(Number(now) + this.state.pausedRemainingMs);
    this.state.pausedAt = null;
    this.state.pausedRemainingMs = null;
    this.state.state = 'Running';
    this.touch(now);
  }

  /** Timer expiry or an explicit deterministic "complete current phase" command. */
  completeCurrentPhase(at: Instant | number): void {
    this.assertTransition('phase-complete');
    const requestedAt = normalizeInstant(at, 'phase-complete.at');
    this.assertNotBefore(this.state.phaseStartedAt, requestedAt, 'phase-complete.at');
    const transitionAt =
      this.state.phaseDeadline != null && Number(requestedAt) >= Number(this.state.phaseDeadline)
        ? this.state.phaseDeadline
        : requestedAt;
    this.advanceOnePhase(transitionAt);
  }

  /**
   * Crash/restart-safe catch-up for deadline-owned phases. It advances from
   * persisted deadlines rather than subtracting arbitrary renderer ticks.
   */
  advanceDuePhases(nowValue: Instant | number): number {
    const now = normalizeInstant(nowValue, 'advanceDuePhases.now');
    let advanced = 0;
    while (
      this.state.state === 'Running' &&
      this.state.phaseDeadline != null &&
      Number(now) >= Number(this.state.phaseDeadline)
    ) {
      const deadline = this.state.phaseDeadline;
      this.advanceOnePhase(deadline);
      advanced += 1;
    }
    return advanced;
  }

  end(at: Instant | number): void {
    this.assertTransition('end');
    this.terminate('Completed', 'user-ended', normalizeInstant(at, 'end.at'));
  }

  cancel(
    at: Instant | number,
    reason: Exclude<ProtocolTerminationReason, 'completed' | 'user-ended'> = 'user-cancelled',
  ): void {
    this.assertTransition('cancel');
    this.terminate('Cancelled', reason, normalizeInstant(at, 'cancel.at'));
  }

  remainingMs(at: Instant | number): number | null {
    if (this.state.state === 'Paused') return this.state.pausedRemainingMs;
    if (this.state.state !== 'Running' || this.state.phaseDeadline == null) return null;
    const now = normalizeInstant(at, 'remainingMs.at');
    return Math.max(0, Number(this.state.phaseDeadline) - Number(now));
  }

  snapshot(): ProtocolSessionSnapshot {
    return cloneSessionSnapshot(this.state);
  }

  private advanceOnePhase(at: Instant): void {
    if (this.state.currentPlanIndex == null)
      throw new TypeError('Running session has no current phase');
    const nextIndex = this.state.currentPlanIndex + 1;
    if (nextIndex >= this.state.phasePlan.length) {
      this.terminate('Completed', 'completed', at);
      return;
    }
    this.enterPhase(nextIndex, at);
    this.touch(at);
  }

  private enterPhase(index: number, at: Instant): void {
    const phase = this.state.phasePlan[index];
    if (!phase) throw new TypeError(`Protocol phase plan index ${index} does not exist`);
    this.state.currentPlanIndex = index;
    this.state.phaseStartedAt = at;
    this.state.phaseDeadline =
      phase.durationMs == null ? null : asInstant(Number(at) + phase.durationMs);
    this.state.pausedAt = null;
    this.state.pausedRemainingMs = null;
  }

  private terminate(
    state: 'Completed' | 'Cancelled',
    reason: ProtocolTerminationReason,
    at: Instant,
  ): void {
    const reference = this.state.pausedAt ?? this.state.phaseStartedAt ?? this.state.startedAt;
    this.assertNotBefore(reference, at, 'termination.at');
    if (this.state.state === 'Paused' && this.state.pausedAt != null) {
      this.state.accumulatedPauseMs += Number(at) - Number(this.state.pausedAt);
    }
    this.state.state = state;
    this.state.endedAt = at;
    this.state.terminationReason = reason;
    this.state.phaseDeadline = null;
    this.state.pausedAt = null;
    this.state.pausedRemainingMs = null;
    this.touch(at);
  }

  private assertTransition(action: ProtocolSessionAction): void {
    const allowed = PROTOCOL_SESSION_TRANSITIONS[this.state.state] as Partial<
      Record<ProtocolSessionAction, readonly ProtocolSessionState[]>
    >;
    if (!allowed[action]) {
      throw new TypeError(`Invalid ProtocolSession transition: ${this.state.state} -> ${action}`);
    }
  }

  private assertNotBefore(reference: Instant | null, value: Instant, field: string): void {
    if (reference != null && Number(value) < Number(reference)) {
      throw new TypeError(`${field} must not move session time backwards`);
    }
  }

  private touch(at: Instant): void {
    this.state.version += 1;
    this.state.updatedAt = at;
  }
}

function validatePhases(phases: readonly ProtocolPhaseDefinition[]): void {
  if (phases.length === 0) throw new TypeError('Protocol phases must not be empty');
  if (!phases.some((phase) => phase.role === 'cycle')) {
    throw new TypeError('Protocol must contain at least one cycle phase');
  }
  const ids = new Set<string>();
  for (const phase of phases) {
    assertNonEmpty(phase.id, 'phase.id');
    if (ids.has(phase.id)) throw new TypeError(`Duplicate protocol phase id: ${phase.id}`);
    ids.add(phase.id);
    if (!PROTOCOL_PHASE_KINDS.includes(phase.kind)) {
      throw new TypeError(`Unsupported protocol phase kind: ${phase.kind}`);
    }
    if (phase.durationMs != null)
      assertPositiveFinite(phase.durationMs, `phase.${phase.id}.durationMs`);
  }
}

function validateBreakPolicy(policy: ProtocolBreakPolicy): void {
  if ((policy.longBreakEveryCycles == null) !== (policy.longBreakDurationMs == null)) {
    throw new TypeError('longBreakEveryCycles and longBreakDurationMs must be configured together');
  }
  if (policy.longBreakEveryCycles != null) {
    assertPositiveInteger(policy.longBreakEveryCycles, 'breakPolicy.longBreakEveryCycles');
    assertPositiveFinite(policy.longBreakDurationMs!, 'breakPolicy.longBreakDurationMs');
  }
}

function validateSessionSnapshot(snapshot: ProtocolSessionSnapshot): void {
  assertNonEmpty(snapshot.id, 'session.id');
  assertNonEmpty(snapshot.identityId, 'session.identityId');
  assertNonEmpty(snapshot.protocolId, 'session.protocolId');
  assertPositiveInteger(snapshot.protocolVersion, 'session.protocolVersion');
  assertPositiveInteger(snapshot.version, 'session.version');
  ProtocolDefinition.load(snapshot.protocolSnapshot);
  if (snapshot.protocolSnapshot.id !== snapshot.protocolId) {
    throw new TypeError('Session protocol snapshot id mismatch');
  }
  if (snapshot.protocolSnapshot.identityId !== snapshot.identityId) {
    throw new TypeError('Session protocol snapshot identity mismatch');
  }
  if (snapshot.protocolSnapshot.version !== snapshot.protocolVersion) {
    throw new TypeError('Session protocol snapshot version mismatch');
  }
  if (snapshot.phasePlan.length === 0) throw new TypeError('Session phase plan must not be empty');
  if (snapshot.currentPlanIndex != null && !snapshot.phasePlan[snapshot.currentPlanIndex]) {
    throw new TypeError('Session current phase index is outside the phase plan');
  }

  const hasCurrentPhase = snapshot.currentPlanIndex != null;
  const hasStartedState =
    snapshot.startedAt != null && snapshot.phaseStartedAt != null && hasCurrentPhase;
  const hasTerminalState = snapshot.endedAt != null && snapshot.terminationReason != null;

  switch (snapshot.state) {
    case 'Idle':
      if (
        snapshot.currentPlanIndex != null ||
        snapshot.startedAt != null ||
        snapshot.phaseStartedAt != null ||
        snapshot.phaseDeadline != null ||
        snapshot.pausedAt != null ||
        snapshot.pausedRemainingMs != null ||
        hasTerminalState
      ) {
        throw new TypeError('Idle ProtocolSession snapshot contains active or terminal state');
      }
      break;
    case 'Running':
      if (
        !hasStartedState ||
        snapshot.pausedAt != null ||
        snapshot.pausedRemainingMs != null ||
        hasTerminalState
      ) {
        throw new TypeError('Running ProtocolSession snapshot is inconsistent');
      }
      break;
    case 'Paused':
      if (!hasStartedState || snapshot.pausedAt == null || hasTerminalState) {
        throw new TypeError('Paused ProtocolSession snapshot is inconsistent');
      }
      break;
    case 'Completed':
      if (!hasStartedState || !hasTerminalState) {
        throw new TypeError('Completed ProtocolSession snapshot is missing terminal state');
      }
      if (
        snapshot.terminationReason !== 'completed' &&
        snapshot.terminationReason !== 'user-ended'
      ) {
        throw new TypeError('Completed ProtocolSession has an invalid termination reason');
      }
      if (
        snapshot.phaseDeadline != null ||
        snapshot.pausedAt != null ||
        snapshot.pausedRemainingMs != null
      ) {
        throw new TypeError('Completed ProtocolSession snapshot retains active timing state');
      }
      break;
    case 'Cancelled':
      if (!hasStartedState || !hasTerminalState) {
        throw new TypeError('Cancelled ProtocolSession snapshot is missing terminal state');
      }
      if (
        snapshot.terminationReason !== 'user-cancelled' &&
        snapshot.terminationReason !== 'superseded' &&
        snapshot.terminationReason !== 'runtime-aborted'
      ) {
        throw new TypeError('Cancelled ProtocolSession has an invalid termination reason');
      }
      if (
        snapshot.phaseDeadline != null ||
        snapshot.pausedAt != null ||
        snapshot.pausedRemainingMs != null
      ) {
        throw new TypeError('Cancelled ProtocolSession snapshot retains active timing state');
      }
      break;
  }
}

function clonePhase(phase: ProtocolPhaseDefinition): ProtocolPhaseDefinition {
  return { ...phase };
}

function cloneProtocolDefinitionState(state: ProtocolDefinitionState): ProtocolDefinitionState {
  return {
    ...state,
    phases: state.phases.map(clonePhase),
    cyclePolicy: { ...state.cyclePolicy },
    breakPolicy: { ...state.breakPolicy },
  };
}

function cloneSessionSnapshot(snapshot: ProtocolSessionSnapshot): ProtocolSessionSnapshot {
  return {
    ...snapshot,
    protocolSnapshot: cloneProtocolDefinitionState(snapshot.protocolSnapshot),
    phasePlan: snapshot.phasePlan.map((phase) => ({ ...phase })),
  };
}

function isBreakKind(kind: ProtocolPhaseKind): boolean {
  return kind === 'ShortBreak' || kind === 'LongBreak';
}

function normalizeInstant(value: Instant | number, field: string): Instant {
  if (!Number.isFinite(Number(value)))
    throw new TypeError(`${field} must be a finite epoch-ms Instant`);
  return asInstant(Number(value));
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new TypeError(`${field} must be a positive integer`);
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${field} must be a positive finite number`);
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new TypeError(`${field} must not be empty`);
}
