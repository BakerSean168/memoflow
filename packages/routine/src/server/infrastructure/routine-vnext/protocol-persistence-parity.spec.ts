import { describe, expect, it } from 'vitest';
import { asInstant } from '@memoflow/time';
import { ProtocolDefinition, ProtocolSession } from '../../domain/routine';
import {
  deserializeProtocolDefinition,
  deserializeProtocolSession,
  normalizeProtocolDefinitionPowerSync,
  normalizeProtocolDefinitionPrisma,
  normalizeProtocolSessionPowerSync,
  normalizeProtocolSessionPrisma,
  protocolDefinitionToPowerSync,
  protocolDefinitionToPrisma,
  protocolSessionToPowerSync,
  protocolSessionToPrisma,
  ROUTINE_PROTOCOL_PERSISTENCE_TABLES,
} from './protocol-persistence-parity';

const minute = 60_000;
const t0 = asInstant(Date.parse('2026-08-25T14:00:00.000Z'));

function createProtocol() {
  return ProtocolDefinition.create({
    id: 'study-50-10',
    identityId: 'identity-1',
    name: '50/10',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 50 * minute },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * minute },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 2 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: t0,
  });
}

describe('Routine protocol Prisma / PowerSync parity', () => {
  it('keeps ProtocolDefinition truth identical across both representations', () => {
    const protocol = createProtocol();
    const prisma = protocolDefinitionToPrisma(protocol);
    const powerSync = protocolDefinitionToPowerSync(protocol);

    expect(normalizeProtocolDefinitionPrisma(prisma)).toEqual(
      normalizeProtocolDefinitionPowerSync(powerSync),
    );
    expect(deserializeProtocolDefinition(prisma.definitionJson).snapshot()).toEqual(
      protocol.snapshot(),
    );
  });

  it('persists a restart-safe session snapshot with protocol version, phase plan and deadline', () => {
    const protocol = createProtocol();
    const session = ProtocolSession.create({
      id: 'session-1',
      identityId: 'identity-1',
      protocol,
      now: t0,
    });
    session.start(t0);
    session.pause(asInstant(Number(t0) + 20 * minute));

    const prisma = protocolSessionToPrisma(session);
    const powerSync = protocolSessionToPowerSync(session);
    expect(normalizeProtocolSessionPrisma(prisma)).toEqual(
      normalizeProtocolSessionPowerSync(powerSync),
    );

    const restored = deserializeProtocolSession(prisma.snapshotJson);
    expect(restored.snapshot()).toEqual(session.snapshot());
    expect(restored.protocolVersion).toBe(1);
    expect(restored.currentPhase?.kind).toBe('Focus');
  });

  it('uses dedicated definition/session tables and rejects malformed persisted snapshots', () => {
    expect(ROUTINE_PROTOCOL_PERSISTENCE_TABLES).toEqual({
      definitions: 'routine_protocol_definitions',
      sessions: 'routine_protocol_sessions',
    });
    expect(() =>
      deserializeProtocolSession(
        JSON.stringify({
          id: 'fake',
          identityId: 'identity-1',
          protocolId: 'p',
          state: 'Running',
          phasePlan: [],
        }),
      ),
    ).toThrow();
  });
});
