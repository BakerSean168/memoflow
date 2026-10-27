import { ProtocolSession } from '../../domain/routine';
import {
  ProtocolSessionNotFoundError,
  ProtocolSessionVersionConflictError,
  type ProtocolSessionPersistenceReceipt,
  type ProtocolSessionStore,
} from '../../domain/ports';

export interface InMemoryProtocolSessionStore extends ProtocolSessionStore {
  getSaveCount(sessionId?: string): number;
}

function key(identityId: string, sessionId: string): string {
  return `${identityId}\u0000${sessionId}`;
}

function clone(session: ProtocolSession): ProtocolSession {
  return ProtocolSession.load(session.snapshot());
}

function persistedReceipt(
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

export function createInMemoryProtocolSessionStore(): InMemoryProtocolSessionStore {
  const sessions = new Map<string, ProtocolSession>();
  const saveCounts = new Map<string, number>();

  return {
    async create(session) {
      const sessionKey = key(session.identityId, session.id);
      if (sessions.has(sessionKey)) {
        throw new ProtocolSessionVersionConflictError(
          session.identityId,
          session.id,
          0,
          sessions.get(sessionKey)?.version ?? null,
        );
      }
      sessions.set(sessionKey, clone(session));
      return persistedReceipt(session, null);
    },

    async findById(input) {
      const session = sessions.get(key(input.identityId, input.sessionId));
      return session ? clone(session) : null;
    },

    async listRecoverable(input) {
      return [...sessions.values()]
        .filter(
          (session) =>
            session.identityId === input.identityId &&
            (session.status === 'Running' || session.status === 'Paused'),
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(clone);
    },

    async save(session, expectedVersion) {
      const sessionKey = key(session.identityId, session.id);
      const current = sessions.get(sessionKey);
      if (!current) {
        throw new ProtocolSessionNotFoundError(session.identityId, session.id);
      }
      if (current.version !== expectedVersion) {
        throw new ProtocolSessionVersionConflictError(
          session.identityId,
          session.id,
          expectedVersion,
          current.version,
        );
      }
      if (session.version <= expectedVersion) {
        throw new TypeError('ProtocolSession save requires a version-advancing transition');
      }
      sessions.set(sessionKey, clone(session));
      saveCounts.set(session.id, (saveCounts.get(session.id) ?? 0) + 1);
      return persistedReceipt(session, expectedVersion);
    },

    getSaveCount(sessionId) {
      if (sessionId != null) return saveCounts.get(sessionId) ?? 0;
      return [...saveCounts.values()].reduce((sum, count) => sum + count, 0);
    },
  };
}
