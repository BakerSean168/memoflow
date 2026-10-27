import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { asInstant } from '@memoflow/time';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../__tests__/integration-helpers';
import { ProtocolDefinition, ProtocolSession } from '../../domain/routine';
import { ProtocolSessionVersionConflictError } from '../../domain/ports';
import { protocolDefinitionToPrisma } from './protocol-persistence-parity';
import { PrismaProtocolSessionStore } from './protocol-session-store.prisma';

function createProtocol(identityId: string): ProtocolDefinition {
  return ProtocolDefinition.create({
    id: 'protocol-prisma-50-10',
    identityId,
    name: '50/10',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 50 * 60_000 },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * 60_000 },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 1 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: asInstant(Date.parse('2026-08-27T00:00:00.000Z')),
  });
}

describe('PrismaProtocolSessionStore integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('persists recoverable snapshots and fences stale phase transitions', async () => {
    const prisma = await getPrisma();
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId });
    const protocol = createProtocol(identityId);
    await prisma.routineProtocolDefinition.create({ data: protocolDefinitionToPrisma(protocol) });

    const session = ProtocolSession.create({
      id: 'session-prisma-1',
      identityId,
      protocol,
      now: asInstant(1_000),
    });
    session.start(asInstant(1_000));
    const store = new PrismaProtocolSessionStore(prisma);
    await store.create(session);

    const stale = await store.findById({ identityId, sessionId: session.id });
    const current = await store.findById({ identityId, sessionId: session.id });
    expect(stale?.snapshot()).toEqual(session.snapshot());
    expect(await store.listRecoverable({ identityId })).toHaveLength(1);

    current!.pause(asInstant(5_000));
    await expect(store.save(current!, 2)).resolves.toMatchObject({ persistedVersion: 3 });

    stale!.cancel(asInstant(6_000));
    await expect(store.save(stale!, 2)).rejects.toBeInstanceOf(ProtocolSessionVersionConflictError);

    expect((await store.findById({ identityId, sessionId: session.id }))?.snapshot()).toMatchObject(
      { state: 'Paused', version: 3 },
    );
  });

  it('excludes terminal snapshots from restart recovery enumeration', async () => {
    const prisma = await getPrisma();
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId });
    const protocol = createProtocol(identityId);
    await prisma.routineProtocolDefinition.create({ data: protocolDefinitionToPrisma(protocol) });

    const session = ProtocolSession.create({
      id: 'session-prisma-terminal',
      identityId,
      protocol,
      now: asInstant(1_000),
    });
    session.start(asInstant(1_000));
    const store = new PrismaProtocolSessionStore(prisma);
    await store.create(session);
    session.end(asInstant(2_000));
    await store.save(session, 2);

    expect(await store.listRecoverable({ identityId })).toEqual([]);
  });
});
