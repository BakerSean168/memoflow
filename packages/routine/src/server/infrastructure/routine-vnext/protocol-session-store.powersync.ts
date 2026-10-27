import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  deserializeProtocolSession,
  protocolSessionToPowerSync,
  type ProtocolSessionPowerSyncRecord,
} from './protocol-persistence-parity';
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

export class PowerSyncProtocolSessionStore implements ProtocolSessionStore {
  constructor(private readonly db: IElectronDatabase) {}

  async create(session: ProtocolSession): Promise<ProtocolSessionPersistenceReceipt> {
    const row = protocolSessionToPowerSync(session);
    const result = await this.db.execute(
      `INSERT INTO routine_protocol_sessions (
        id, identity_id, protocol_id, protocol_version, status, snapshot_json,
        termination_reason, ended_at, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.identity_id,
        row.protocol_id,
        row.protocol_version,
        row.status,
        row.snapshot_json,
        row.termination_reason,
        row.ended_at,
        row.version,
        row.created_at,
        row.updated_at,
      ],
    );
    if (result.rowsAffected !== 1) {
      throw new Error(`ProtocolSession '${session.id}' insert did not affect exactly one row`);
    }
    return receipt(session, null);
  }

  async findById(input: {
    readonly identityId: string;
    readonly sessionId: string;
  }): Promise<ProtocolSession | null> {
    const row = await this.db.getOptional<ProtocolSessionPowerSyncRecord>(
      `SELECT id, identity_id, protocol_id, protocol_version, status, snapshot_json,
              termination_reason, ended_at, version, created_at, updated_at
       FROM routine_protocol_sessions
       WHERE id = ? AND identity_id = ?
       LIMIT 1`,
      [input.sessionId, input.identityId],
    );
    return row ? deserializeProtocolSession(row.snapshot_json) : null;
  }

  async listRecoverable(input: { readonly identityId: string }): Promise<ProtocolSession[]> {
    const rows = await this.db.getAll<ProtocolSessionPowerSyncRecord>(
      `SELECT id, identity_id, protocol_id, protocol_version, status, snapshot_json,
              termination_reason, ended_at, version, created_at, updated_at
       FROM routine_protocol_sessions
       WHERE identity_id = ? AND status IN ('Running', 'Paused')
       ORDER BY created_at ASC, id ASC`,
      [input.identityId],
    );
    return rows.map((row) => deserializeProtocolSession(row.snapshot_json));
  }

  async save(
    session: ProtocolSession,
    expectedVersion: number,
  ): Promise<ProtocolSessionPersistenceReceipt> {
    if (session.version <= expectedVersion) {
      throw new TypeError('ProtocolSession save requires a version-advancing transition');
    }
    const row = protocolSessionToPowerSync(session);
    const result = await this.db.execute(
      `UPDATE routine_protocol_sessions
       SET protocol_version = ?, status = ?, snapshot_json = ?, termination_reason = ?,
           ended_at = ?, version = ?, updated_at = ?
       WHERE id = ? AND identity_id = ? AND version = ?`,
      [
        row.protocol_version,
        row.status,
        row.snapshot_json,
        row.termination_reason,
        row.ended_at,
        row.version,
        row.updated_at,
        row.id,
        row.identity_id,
        expectedVersion,
      ],
    );
    if (result.rowsAffected === 1) return receipt(session, expectedVersion);

    const current = await this.db.getOptional<{ version: number }>(
      `SELECT version FROM routine_protocol_sessions
       WHERE id = ? AND identity_id = ? LIMIT 1`,
      [row.id, row.identity_id],
    );
    if (!current) {
      throw new ProtocolSessionNotFoundError(session.identityId, session.id);
    }
    throw new ProtocolSessionVersionConflictError(
      session.identityId,
      session.id,
      expectedVersion,
      Number(current.version),
    );
  }
}
