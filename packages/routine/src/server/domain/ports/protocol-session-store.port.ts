import type { ProtocolSession } from '../routine';

export interface ProtocolSessionPersistenceReceipt {
  readonly sessionId: string;
  readonly identityId: string;
  readonly expectedVersion: number | null;
  readonly persistedVersion: number;
}

export class ProtocolSessionNotFoundError extends Error {
  constructor(
    readonly identityId: string,
    readonly sessionId: string,
  ) {
    super(`ProtocolSession '${sessionId}' was not found for identity '${identityId}'`);
    this.name = 'ProtocolSessionNotFoundError';
  }
}

export class ProtocolSessionVersionConflictError extends Error {
  constructor(
    readonly identityId: string,
    readonly sessionId: string,
    readonly expectedVersion: number,
    readonly currentVersion: number | null,
  ) {
    super(
      `ProtocolSession '${sessionId}' version conflict: expected ${expectedVersion}, current ${currentVersion ?? 'missing'}`,
    );
    this.name = 'ProtocolSessionVersionConflictError';
  }
}

/** Durable ProtocolSession snapshot store with optimistic-version fencing. */
export interface ProtocolSessionStore {
  create(session: ProtocolSession): Promise<ProtocolSessionPersistenceReceipt>;
  findById(input: {
    readonly identityId: string;
    readonly sessionId: string;
  }): Promise<ProtocolSession | null>;
  listRecoverable(input: { readonly identityId: string }): Promise<ProtocolSession[]>;
  save(
    session: ProtocolSession,
    expectedVersion: number,
  ): Promise<ProtocolSessionPersistenceReceipt>;
}
