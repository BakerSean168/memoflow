import { asInstant, type Instant } from '@memoflow/time';
import type {
  ProtocolPhasePlanEntry,
  ProtocolSession,
  ProtocolSessionSnapshot,
  ProtocolSessionState,
  ProtocolTerminationReason,
} from '../../domain/routine';
import {
  ProtocolSessionNotFoundError,
  ProtocolSessionVersionConflictError,
  type ProtocolSessionPersistenceReceipt,
  type ProtocolSessionStore,
} from '../../domain/ports';
import {
  buildProtocolBreakCompletionFact,
  type ProtocolBreakCreditRuntime,
} from '../protocol-break-credit';

export type ProtocolSessionRuntimeAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'phase-complete'
  | 'end'
  | 'cancel'
  | 'recover';

export interface ProtocolPhaseTransitionReceipt {
  readonly operationId: string;
  readonly action: ProtocolSessionRuntimeAction;
  readonly status: 'applied' | 'unchanged';
  readonly sessionId: string;
  readonly identityId: string;
  readonly previousVersion: number;
  readonly persistedVersion: number;
  readonly previousState: ProtocolSessionState;
  readonly state: ProtocolSessionState;
  readonly previousPhaseKey: string | null;
  readonly phaseKey: string | null;
  readonly advancedPhaseCount: number;
  readonly at: Instant;
  readonly persistence: ProtocolSessionPersistenceReceipt | null;
}

export interface ProtocolSessionRecoveryReport {
  readonly identityId: string;
  readonly at: Instant;
  readonly receipts: readonly ProtocolPhaseTransitionReceipt[];
  readonly advanced: number;
  readonly unchanged: number;
}

export interface ProtocolSessionRuntime {
  persistNewSession(session: ProtocolSession): Promise<ProtocolSessionPersistenceReceipt>;
  transition(input: {
    readonly identityId: string;
    readonly sessionId: string;
    readonly action: Exclude<ProtocolSessionRuntimeAction, 'recover'>;
    readonly at?: Instant | number;
    readonly cancelReason?: Exclude<ProtocolTerminationReason, 'completed' | 'user-ended'>;
  }): Promise<ProtocolPhaseTransitionReceipt>;
  recoverSession(input: {
    readonly identityId: string;
    readonly sessionId: string;
    readonly at?: Instant | number;
  }): Promise<ProtocolPhaseTransitionReceipt>;
  recoverIdentity(input: {
    readonly identityId: string;
    readonly at?: Instant | number;
  }): Promise<ProtocolSessionRecoveryReport>;
}

export interface CreateProtocolSessionRuntimeOptions {
  readonly store: ProtocolSessionStore;
  /** Optional ambient-routine credit sink invoked after a durable break completion. */
  readonly protocolBreakCreditRuntime?: ProtocolBreakCreditRuntime;
  readonly now?: () => number;
  /** Bounded CAS retries for two runtimes recovering the same durable session. */
  readonly recoveryConflictRetries?: number;
}

function phaseKey(phase: ProtocolPhasePlanEntry | null): string | null {
  return phase == null ? null : `${phase.cycle ?? 'session'}:${phase.id}:${phase.kind}`;
}

function receiptFor(input: {
  action: ProtocolSessionRuntimeAction;
  status: 'applied' | 'unchanged';
  before: ProtocolSessionSnapshot;
  after: ProtocolSession;
  at: Instant;
  advancedPhaseCount: number;
  persistence: ProtocolSessionPersistenceReceipt | null;
}): ProtocolPhaseTransitionReceipt {
  const afterSnapshot = input.after.snapshot();
  return {
    operationId: `${afterSnapshot.id}:v${input.before.version}->v${afterSnapshot.version}:${input.action}`,
    action: input.action,
    status: input.status,
    sessionId: afterSnapshot.id,
    identityId: afterSnapshot.identityId,
    previousVersion: input.before.version,
    persistedVersion: afterSnapshot.version,
    previousState: input.before.state,
    state: afterSnapshot.state,
    previousPhaseKey:
      input.before.currentPlanIndex == null
        ? null
        : phaseKey(input.before.phasePlan[input.before.currentPlanIndex] ?? null),
    phaseKey: phaseKey(input.after.currentPhase),
    advancedPhaseCount: input.advancedPhaseCount,
    at: input.at,
    persistence: input.persistence,
  };
}

export function createProtocolSessionRuntime(
  options: CreateProtocolSessionRuntimeOptions,
): ProtocolSessionRuntime {
  const now = options.now ?? Date.now;
  const recoveryConflictRetries = options.recoveryConflictRetries ?? 2;
  if (!Number.isInteger(recoveryConflictRetries) || recoveryConflictRetries < 0) {
    throw new TypeError('recoveryConflictRetries must be a non-negative integer');
  }

  const resolveAt = (value: Instant | number | undefined): Instant =>
    asInstant(Number(value ?? now()));

  async function loadRequired(identityId: string, sessionId: string): Promise<ProtocolSession> {
    const session = await options.store.findById({ identityId, sessionId });
    if (!session) throw new ProtocolSessionNotFoundError(identityId, sessionId);
    return session;
  }

  return {
    persistNewSession(session) {
      return options.store.create(session);
    },

    async transition(input) {
      const at = resolveAt(input.at);
      const session = await loadRequired(input.identityId, input.sessionId);
      const before = session.snapshot();
      const breakFacts: NonNullable<ReturnType<typeof buildProtocolBreakCompletionFact>>[] = [];
      let advancedPhaseCount = 0;

      switch (input.action) {
        case 'start':
          session.start(at);
          break;
        case 'pause':
          // ProtocolSession.pause() performs deadline catch-up before entering
          // Paused. Capture those deadline-owned break facts here first so the
          // runtime can credit them only after the resulting snapshot is
          // durably persisted. The domain's internal catch-up then becomes a
          // no-op at the same Instant.
          while (
            session.status === 'Running' &&
            session.snapshot().phaseDeadline != null &&
            Number(at) >= Number(session.snapshot().phaseDeadline)
          ) {
            const beforePhase = session.snapshot();
            const deadline = beforePhase.phaseDeadline!;
            const fact = options.protocolBreakCreditRuntime
              ? buildProtocolBreakCompletionFact({ session: beforePhase, completedAt: deadline })
              : null;
            session.completeCurrentPhase(deadline);
            advancedPhaseCount += 1;
            if (fact) breakFacts.push(fact);
          }
          session.pause(at);
          break;
        case 'resume':
          session.resume(at);
          break;
        case 'phase-complete': {
          // Capture the pre-transition snapshot: completeCurrentPhase advances
          // the plan, so the completed break is no longer addressable after it.
          const completedAt =
            before.phaseDeadline != null && Number(at) >= Number(before.phaseDeadline)
              ? before.phaseDeadline
              : at;
          const breakFact = options.protocolBreakCreditRuntime
            ? buildProtocolBreakCompletionFact({ session: before, completedAt })
            : null;
          session.completeCurrentPhase(at);
          if (before.currentPlanIndex !== session.snapshot().currentPlanIndex) {
            advancedPhaseCount = 1;
          }
          if (breakFact) breakFacts.push(breakFact);
          break;
        }
        case 'end':
          session.end(at);
          break;
        case 'cancel':
          session.cancel(at, input.cancelReason);
          break;
      }

      const persistence = await options.store.save(session, before.version);
      for (const fact of breakFacts) options.protocolBreakCreditRuntime?.creditBreak(fact);
      return receiptFor({
        action: input.action,
        status: 'applied',
        before,
        after: session,
        at,
        advancedPhaseCount,
        persistence,
      });
    },

    async recoverSession(input) {
      const at = resolveAt(input.at);
      let attempts = 0;

      while (true) {
        const session = await loadRequired(input.identityId, input.sessionId);
        const before = session.snapshot();
        if (session.status !== 'Running') {
          return receiptFor({
            action: 'recover',
            status: 'unchanged',
            before,
            after: session,
            at,
            advancedPhaseCount: 0,
            persistence: null,
          });
        }

        // Capture every deadline-owned break before advancing it. A single
        // recovery can cross several phases, so credit each intermediate
        // break from its pre-transition snapshot rather than only the final
        // phase (or bypassing credit altogether).
        const breakFacts: NonNullable<ReturnType<typeof buildProtocolBreakCompletionFact>>[] = [];
        let advancedPhaseCount = 0;
        while (
          session.status === 'Running' &&
          session.snapshot().phaseDeadline != null &&
          Number(at) >= Number(session.snapshot().phaseDeadline)
        ) {
          const beforePhase = session.snapshot();
          const deadline = beforePhase.phaseDeadline!;
          const fact = options.protocolBreakCreditRuntime
            ? buildProtocolBreakCompletionFact({ session: beforePhase, completedAt: deadline })
            : null;
          session.completeCurrentPhase(deadline);
          advancedPhaseCount += 1;
          if (fact) breakFacts.push(fact);
        }
        if (advancedPhaseCount === 0) {
          return receiptFor({
            action: 'recover',
            status: 'unchanged',
            before,
            after: session,
            at,
            advancedPhaseCount: 0,
            persistence: null,
          });
        }

        try {
          const persistence = await options.store.save(session, before.version);
          for (const fact of breakFacts) options.protocolBreakCreditRuntime?.creditBreak(fact);
          return receiptFor({
            action: 'recover',
            status: 'applied',
            before,
            after: session,
            at,
            advancedPhaseCount,
            persistence,
          });
        } catch (error) {
          if (!(error instanceof ProtocolSessionVersionConflictError)) throw error;
          if (attempts >= recoveryConflictRetries) throw error;
          attempts += 1;
          // Another runtime won the same durable transition. Reload the newer
          // version and re-evaluate the persisted deadline at the same Instant.
        }
      }
    },

    async recoverIdentity(input) {
      const at = resolveAt(input.at);
      const sessions = await options.store.listRecoverable({ identityId: input.identityId });
      const receipts: ProtocolPhaseTransitionReceipt[] = [];
      for (const session of sessions) {
        receipts.push(
          await this.recoverSession({
            identityId: input.identityId,
            sessionId: session.id,
            at,
          }),
        );
      }
      return {
        identityId: input.identityId,
        at,
        receipts,
        advanced: receipts.filter((item) => item.status === 'applied').length,
        unchanged: receipts.filter((item) => item.status === 'unchanged').length,
      };
    },
  };
}
