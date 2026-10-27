import { asInstant, type Instant } from '@memoflow/time';

export const INTERVENTION_ACTIVE_STATES = ['Due', 'Gentle', 'Grace', 'Guided', 'Strict'] as const;
export type InterventionActiveState = (typeof INTERVENTION_ACTIVE_STATES)[number];

export const INTERVENTION_TERMINAL_STATES = [
  'Completed',
  'Snoozed',
  'Dismissed',
  'Escaped',
] as const;
export type InterventionTerminalState = (typeof INTERVENTION_TERMINAL_STATES)[number];
export type InterventionState = InterventionActiveState | InterventionTerminalState;

export type InterventionCompletionReason = 'explicit-complete' | 'natural-stop';

export interface InterventionPolicy {
  readonly gentleDurationMs: number;
  readonly graceDurationMs: number;
  readonly guidedDurationMs: number;
  readonly strictEnabled: boolean;
}

export interface InterventionTransitionRecord {
  readonly from: InterventionState;
  readonly to: InterventionState;
  readonly at: Instant;
  readonly reason:
    | 'due'
    | 'gentle-timeout'
    | 'grace-timeout'
    | 'guided-timeout'
    | 'explicit-complete'
    | 'natural-stop'
    | 'snooze'
    | 'snooze-expired'
    | 'dismiss'
    | 'safe-escape';
}

export interface InterventionSnapshot {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly dueAt: Instant;
  readonly policy: InterventionPolicy;
  readonly state: InterventionState;
  readonly phaseEnteredAt: Instant;
  readonly phaseDeadline: Instant | null;
  readonly completionReason: InterventionCompletionReason | null;
  readonly snoozeUntil: Instant | null;
  readonly version: number;
  readonly history: readonly InterventionTransitionRecord[];
}

export type InterventionCommand =
  | { readonly action: 'complete'; readonly at?: Instant | number }
  | { readonly action: 'natural-stop'; readonly at?: Instant | number }
  | { readonly action: 'snooze'; readonly durationMs: number; readonly at?: Instant | number }
  | { readonly action: 'dismiss'; readonly at?: Instant | number }
  | { readonly action: 'safe-escape'; readonly at?: Instant | number };

export interface InterventionTransitionReceipt {
  readonly occurrenceKey: string;
  readonly previousState: InterventionState;
  readonly state: InterventionState;
  readonly applied: boolean;
  readonly version: number;
  readonly transitions: readonly InterventionTransitionRecord[];
  readonly snapshot: InterventionSnapshot;
}

export interface InterventionRuntime {
  createDue(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
    readonly dueAt: Instant | number;
    readonly policy: InterventionPolicy;
  }): InterventionSnapshot;
  restore(snapshot: InterventionSnapshot): InterventionSnapshot;
  getSnapshot(occurrenceKey: string): InterventionSnapshot | null;
  listActive(): InterventionSnapshot[];
  advance(occurrenceKey: string, at?: Instant | number): InterventionTransitionReceipt;
  execute(occurrenceKey: string, command: InterventionCommand): InterventionTransitionReceipt;
  onChanged(listener: (snapshot: InterventionSnapshot) => void): () => void;
}

interface MutableSession {
  identityId: string;
  routineId: string;
  occurrenceKey: string;
  dueAt: Instant;
  policy: InterventionPolicy;
  state: InterventionState;
  phaseEnteredAt: Instant;
  phaseDeadline: Instant | null;
  completionReason: InterventionCompletionReason | null;
  snoozeUntil: Instant | null;
  version: number;
  history: InterventionTransitionRecord[];
}

export interface CreateInterventionRuntimeOptions {
  readonly now?: () => number;
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive finite number`);
  }
}

function normalizePolicy(policy: InterventionPolicy): InterventionPolicy {
  assertPositiveFinite(policy.gentleDurationMs, 'gentleDurationMs');
  assertPositiveFinite(policy.graceDurationMs, 'graceDurationMs');
  assertPositiveFinite(policy.guidedDurationMs, 'guidedDurationMs');
  return { ...policy };
}

function isTerminal(state: InterventionState): state is InterventionTerminalState {
  return (INTERVENTION_TERMINAL_STATES as readonly string[]).includes(state);
}

function cloneSnapshot(session: MutableSession): InterventionSnapshot {
  return {
    identityId: session.identityId,
    routineId: session.routineId,
    occurrenceKey: session.occurrenceKey,
    dueAt: session.dueAt,
    policy: { ...session.policy },
    state: session.state,
    phaseEnteredAt: session.phaseEnteredAt,
    phaseDeadline: session.phaseDeadline,
    completionReason: session.completionReason,
    snoozeUntil: session.snoozeUntil,
    version: session.version,
    history: session.history.map((entry) => ({ ...entry })),
  };
}

function loadSnapshot(snapshot: InterventionSnapshot): MutableSession {
  const policy = normalizePolicy(snapshot.policy);
  if (!snapshot.identityId.trim() || !snapshot.routineId.trim() || !snapshot.occurrenceKey.trim()) {
    throw new TypeError('Intervention snapshot ownership fields must not be empty');
  }
  if (
    !Number.isFinite(Number(snapshot.dueAt)) ||
    !Number.isFinite(Number(snapshot.phaseEnteredAt))
  ) {
    throw new TypeError('Intervention snapshot contains invalid Instants');
  }
  if (!Number.isInteger(snapshot.version) || snapshot.version <= 0) {
    throw new TypeError('Intervention snapshot version must be a positive integer');
  }
  if (snapshot.state === 'Strict' && !policy.strictEnabled) {
    throw new TypeError('Strict intervention state requires strictEnabled=true');
  }
  if (isTerminal(snapshot.state) && snapshot.phaseDeadline != null) {
    throw new TypeError('Terminal intervention state must not retain a phase deadline');
  }
  return {
    ...snapshot,
    policy,
    history: snapshot.history.map((entry) => ({ ...entry })),
  };
}

function noChange(
  session: MutableSession,
  previousState: InterventionState,
): InterventionTransitionReceipt {
  return {
    occurrenceKey: session.occurrenceKey,
    previousState,
    state: session.state,
    applied: false,
    version: session.version,
    transitions: [],
    snapshot: cloneSnapshot(session),
  };
}

export function createInterventionRuntime(
  options: CreateInterventionRuntimeOptions = {},
): InterventionRuntime {
  const now = options.now ?? Date.now;
  const sessions = new Map<string, MutableSession>();
  const listeners = new Set<(snapshot: InterventionSnapshot) => void>();

  const resolveAt = (value?: Instant | number): Instant => asInstant(Number(value ?? now()));

  const notify = (session: MutableSession): void => {
    const snapshot = cloneSnapshot(session);
    for (const listener of listeners) listener(snapshot);
  };

  const requireSession = (occurrenceKey: string): MutableSession => {
    const session = sessions.get(occurrenceKey);
    if (!session) throw new Error(`Intervention '${occurrenceKey}' was not found`);
    return session;
  };

  const applyTransition = (
    session: MutableSession,
    to: InterventionState,
    at: Instant,
    reason: InterventionTransitionRecord['reason'],
    nextDeadline: Instant | null,
  ): InterventionTransitionRecord => {
    const record: InterventionTransitionRecord = { from: session.state, to, at, reason };
    session.state = to;
    session.phaseEnteredAt = at;
    session.phaseDeadline = nextDeadline;
    session.version += 1;
    session.history.push(record);
    return record;
  };

  const advanceSession = (session: MutableSession, at: Instant): InterventionTransitionReceipt => {
    const previousState = session.state;
    if (Number(at) < Number(session.dueAt)) {
      return noChange(session, previousState);
    }

    const transitions: InterventionTransitionRecord[] = [];
    // Snooze hides presentation but does not resolve the RoutineOccurrence. It
    // is therefore resumable at the same stable occurrence key once the durable
    // TemporaryOverride expires. Other terminal states remain terminal.
    if (session.state === 'Snoozed') {
      if (session.snoozeUntil == null || Number(at) < Number(session.snoozeUntil)) {
        return noChange(session, previousState);
      }
      const resumedAt = session.snoozeUntil;
      session.snoozeUntil = null;
      transitions.push(
        applyTransition(
          session,
          'Gentle',
          resumedAt,
          'snooze-expired',
          asInstant(Number(resumedAt) + session.policy.gentleDurationMs),
        ),
      );
    } else if (isTerminal(session.state)) {
      return noChange(session, previousState);
    }

    if (session.state === 'Due') {
      const gentleAt = session.dueAt;
      transitions.push(
        applyTransition(
          session,
          'Gentle',
          gentleAt,
          'due',
          asInstant(Number(gentleAt) + session.policy.gentleDurationMs),
        ),
      );
    }

    while (session.phaseDeadline != null && Number(at) >= Number(session.phaseDeadline)) {
      const boundary = session.phaseDeadline;
      if (session.state === 'Gentle') {
        transitions.push(
          applyTransition(
            session,
            'Grace',
            boundary,
            'gentle-timeout',
            asInstant(Number(boundary) + session.policy.graceDurationMs),
          ),
        );
        continue;
      }
      if (session.state === 'Grace') {
        transitions.push(
          applyTransition(
            session,
            'Guided',
            boundary,
            'grace-timeout',
            session.policy.strictEnabled
              ? asInstant(Number(boundary) + session.policy.guidedDurationMs)
              : null,
          ),
        );
        continue;
      }
      if (session.state === 'Guided' && session.policy.strictEnabled) {
        transitions.push(applyTransition(session, 'Strict', boundary, 'guided-timeout', null));
      }
      break;
    }

    if (transitions.length > 0) notify(session);
    return {
      occurrenceKey: session.occurrenceKey,
      previousState,
      state: session.state,
      applied: transitions.length > 0,
      version: session.version,
      transitions,
      snapshot: cloneSnapshot(session),
    };
  };

  return {
    createDue(input) {
      const existing = sessions.get(input.occurrenceKey);
      if (existing) {
        if (existing.identityId !== input.identityId || existing.routineId !== input.routineId) {
          throw new TypeError(
            `Intervention occurrence '${input.occurrenceKey}' ownership mismatch`,
          );
        }
        return cloneSnapshot(existing);
      }
      if (!input.identityId.trim() || !input.routineId.trim() || !input.occurrenceKey.trim()) {
        throw new TypeError('Intervention ownership fields must not be empty');
      }
      const dueAt = resolveAt(input.dueAt);
      const session: MutableSession = {
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        dueAt,
        policy: normalizePolicy(input.policy),
        state: 'Due',
        phaseEnteredAt: dueAt,
        phaseDeadline: null,
        completionReason: null,
        snoozeUntil: null,
        version: 1,
        history: [],
      };
      sessions.set(input.occurrenceKey, session);
      notify(session);
      return cloneSnapshot(session);
    },

    restore(snapshot) {
      const session = loadSnapshot(snapshot);
      sessions.set(session.occurrenceKey, session);
      notify(session);
      return cloneSnapshot(session);
    },

    getSnapshot(occurrenceKey) {
      const session = sessions.get(occurrenceKey);
      return session ? cloneSnapshot(session) : null;
    },

    listActive() {
      return [...sessions.values()]
        .filter((session) => !isTerminal(session.state) || session.state === 'Snoozed')
        .map(cloneSnapshot);
    },

    advance(occurrenceKey, value) {
      return advanceSession(requireSession(occurrenceKey), resolveAt(value));
    },

    execute(occurrenceKey, command) {
      const session = requireSession(occurrenceKey);
      const at = resolveAt(command.at);
      if (Number(at) < Number(session.dueAt)) {
        throw new TypeError('Intervention command cannot precede dueAt');
      }
      if (command.action === 'snooze') {
        assertPositiveFinite(command.durationMs, 'snooze.durationMs');
      }
      const advanced = advanceSession(session, at);
      if (isTerminal(session.state)) return noChange(session, advanced.previousState);

      const previousState = session.state;
      let transition: InterventionTransitionRecord;
      switch (command.action) {
        case 'complete':
          session.completionReason = 'explicit-complete';
          transition = applyTransition(session, 'Completed', at, 'explicit-complete', null);
          break;
        case 'natural-stop':
          session.completionReason = 'natural-stop';
          transition = applyTransition(session, 'Completed', at, 'natural-stop', null);
          break;
        case 'snooze':
          session.snoozeUntil = asInstant(Number(at) + command.durationMs);
          transition = applyTransition(session, 'Snoozed', at, 'snooze', null);
          break;
        case 'dismiss':
          transition = applyTransition(session, 'Dismissed', at, 'dismiss', null);
          break;
        case 'safe-escape':
          if (session.state !== 'Strict' || !session.policy.strictEnabled) {
            throw new TypeError(
              'safe-escape is only valid from an explicitly enabled Strict intervention',
            );
          }
          transition = applyTransition(session, 'Escaped', at, 'safe-escape', null);
          break;
      }
      notify(session);
      return {
        occurrenceKey,
        previousState,
        state: session.state,
        applied: true,
        version: session.version,
        transitions: [...advanced.transitions, transition],
        snapshot: cloneSnapshot(session),
      };
    },

    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
