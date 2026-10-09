import type { Prisma, PrismaClient } from '@memoflow/database';
import { deserializeProtocolSession, protocolSessionToPrisma } from './protocol-persistence-parity';
import {
  ProtocolSessionNotFoundError,
  ProtocolSessionVersionConflictError,
  type ProtocolSessionPersistenceReceipt,
  type ProtocolSessionStore,
} from '../../domain/ports';
import type { ProtocolSession } from '../../domain/routine';

function receipt(
  session: ProtocolSession,
  expectedVersion: number | null,
): ProtocolSessionPersistenceReceipt {
  return {
    sessionId: session.id,
    identityId: session.identityId,
    expectedVersion,
    persistedVersion: session.version,
  };
}

export class PrismaProtocolSessionStore implements ProtocolSessionStore {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async create(session: ProtocolSession): Promise<ProtocolSessionPersistenceReceipt> {
    const data = protocolSessionToPrisma(session);
    await this.prisma.routineProtocolSession.create({ data });
    return receipt(session, null);
  }

  async findById(input: {
    readonly identityId: string;
    readonly sessionId: string;
  }): Promise<ProtocolSession | null> {
    const row = await this.prisma.routineProtocolSession.findFirst({
      where: { id: input.sessionId, identityId: input.identityId },
      select: { snapshotJson: true },
    });
    return row ? deserializeProtocolSession(row.snapshotJson) : null;
  }

  async listRecoverable(input: { readonly identityId: string }): Promise<ProtocolSession[]> {
    const rows = await this.prisma.routineProtocolSession.findMany({
      where: {
        identityId: input.identityId,
        status: { in: ['Running', 'Paused'] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { snapshotJson: true },
    });
    return rows.map((row) => deserializeProtocolSession(row.snapshotJson));
  }

  async save(
    session: ProtocolSession,
    expectedVersion: number,
  ): Promise<ProtocolSessionPersistenceReceipt> {
    if (session.version <= expectedVersion) {
      throw new TypeError('ProtocolSession save requires a version-advancing transition');
    }
    const data = protocolSessionToPrisma(session);
    const updated = await this.prisma.routineProtocolSession.updateMany({
      where: {
        id: session.id,
        identityId: session.identityId,
        version: expectedVersion,
      },
      data: {
        protocolVersion: data.protocolVersion,
        status: data.status,
        snapshotJson: data.snapshotJson,
        terminationReason: data.terminationReason,
        endedAt: data.endedAt,
        version: data.version,
        updatedAt: data.updatedAt,
      },
    });
    if (updated.count === 1) return receipt(session, expectedVersion);

    const current = await this.prisma.routineProtocolSession.findFirst({
      where: { id: session.id, identityId: session.identityId },
      select: { version: true },
    });
    if (!current) {
      throw new ProtocolSessionNotFoundError(session.identityId, session.id);
    }
    throw new ProtocolSessionVersionConflictError(
      session.identityId,
      session.id,
      expectedVersion,
      current.version,
    );
  }
}
