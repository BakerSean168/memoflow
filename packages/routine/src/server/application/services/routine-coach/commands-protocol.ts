import type { Instant } from '@memoflow/time';
import { findRoutineMethod } from '@memoflow/routine-contracts/method-library';
import { ProtocolDefinition, ProtocolSession } from '../../../domain/routine';
import type { ProtocolPhaseTransitionReceipt } from '../../../runtime/protocol';
import type {
  RoutineCoachCommandPort,
  RoutineProtocolSessionReceipt,
} from '../routine-coach-command.service';
import {
  optionalPositiveInteger,
  positiveInteger,
  routineNotFound,
  type RoutineCoachCommandContext,
} from './command-context';

function protocolReceipt(
  session: ProtocolSession,
  transition?: ProtocolPhaseTransitionReceipt,
): RoutineProtocolSessionReceipt {
  const snapshot = session.snapshot();
  return {
    sessionId: snapshot.id,
    identityId: snapshot.identityId,
    protocolId: snapshot.protocolId,
    state: transition?.state ?? snapshot.state,
    phaseKey: transition?.phaseKey ?? null,
    version: transition?.persistedVersion ?? snapshot.version,
  };
}

export function createProtocolCommands(
  ctx: RoutineCoachCommandContext,
): Pick<RoutineCoachCommandPort, 'startPresetProtocol' | 'transitionProtocol'> {
  const { options, now, protocolRuntime } = ctx;
  return {
    async startPresetProtocol(input) {
      const method = findRoutineMethod(input.methodId);
      if (method.runtimeRequirement !== 'Protocol') {
        throw new TypeError(`Routine method '${input.methodId}' is not Protocol-owned`);
      }
      const recommended = method.recommendedParameters;
      const focusMinutes = positiveInteger(
        input.focusMinutes ?? recommended.focusMinutes ?? 0,
        'focusMinutes',
      );
      const breakMinutes = positiveInteger(
        input.breakMinutes ?? recommended.breakMinutes ?? 0,
        'breakMinutes',
      );
      const cycles = positiveInteger(input.cycles ?? recommended.cycles ?? 0, 'cycles');
      const longBreakEveryCycles = optionalPositiveInteger(
        input.longBreakEveryCycles ?? recommended.longBreakEveryCycles,
        'longBreakEveryCycles',
      );
      const longBreakMinutes = optionalPositiveInteger(
        input.longBreakMinutes ?? recommended.longBreakMinutes,
        'longBreakMinutes',
      );
      if ((longBreakEveryCycles == null) !== (longBreakMinutes == null)) {
        throw new TypeError(
          'longBreakEveryCycles and longBreakMinutes must be configured together',
        );
      }
      const at = input.at ?? now();
      const protocol = ProtocolDefinition.create({
        identityId: input.identityId,
        name: method.name,
        phases: [
          {
            id: 'focus',
            kind: 'Focus',
            role: 'cycle',
            durationMs: focusMinutes * 60_000,
          },
          {
            id: 'break',
            kind: 'ShortBreak',
            role: 'cycle',
            durationMs: breakMinutes * 60_000,
          },
        ],
        cyclePolicy: { mode: 'fixed', cycles },
        breakPolicy: {
          afterFinalCycle: 'include',
          longBreakEveryCycles,
          longBreakDurationMs: longBreakMinutes == null ? null : longBreakMinutes * 60_000,
        },
        now: at,
      });
      const session = ProtocolSession.create({ identityId: input.identityId, protocol, now: at });
      await protocolRuntime.persistNewSession(session);
      const transition = await protocolRuntime.transition({
        identityId: input.identityId,
        sessionId: session.id,
        action: 'start',
        at: at as Instant,
      });
      return protocolReceipt(session, transition);
    },

    async transitionProtocol(input) {
      const transition = await protocolRuntime.transition({
        identityId: input.identityId,
        sessionId: input.sessionId,
        action: input.action,
        at: input.at,
      });
      const persisted = await options.protocolSessionStore.findById({
        identityId: input.identityId,
        sessionId: input.sessionId,
      });
      if (!persisted)
        throw routineNotFound(`Protocol session '${input.sessionId}' disappeared after transition`);
      return protocolReceipt(persisted, transition);
    },
  };
}
