import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { PreferenceNamespace } from '@memoflow/contracts/setting';
import type {
  IUserPreferenceRepository,
  PreferenceCompareAndSwapResult,
  PreferenceCreateResult,
} from '../../../preferences';
import { UserPreferenceDocument } from '../../../preferences';
import {
  PowerSyncUserPreferenceMapper,
  type PowerSyncUserPreferenceRow,
} from './powersync-user-preference.mapper';

const FIND_SQL = `SELECT id, identity_id, namespace, payload, revision, created_at, updated_at
FROM user_preference_records
WHERE identity_id = ? AND namespace = ?
LIMIT 1`;

function assertCreateRevision(document: UserPreferenceDocument): void {
  if (document.revision !== 1) {
    throw new TypeError(
      `New preference rows must start at revision 1, got ${String(document.revision)}`,
    );
  }
}

function assertCasRevision(document: UserPreferenceDocument, expectedRevision: number): void {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError(`Invalid expected preference revision: ${String(expectedRevision)}`);
  }
  if (document.revision !== expectedRevision + 1) {
    throw new TypeError(
      `Preference CAS must advance exactly one revision: expected ${String(expectedRevision + 1)}, got ${String(document.revision)}`,
    );
  }
}

export class UserPreferencePowerSyncRepository implements IUserPreferenceRepository {
  constructor(private readonly db: IElectronDatabaseTransaction) {}

  async find(
    identityId: string,
    namespace: PreferenceNamespace,
  ): Promise<UserPreferenceDocument | null> {
    const row = await this.db.getOptional<PowerSyncUserPreferenceRow>(FIND_SQL, [
      identityId,
      namespace,
    ]);
    return row ? PowerSyncUserPreferenceMapper.toDomain(row) : null;
  }

  async list(identityId: string): Promise<readonly UserPreferenceDocument[]> {
    const rows = await this.db.getAll<PowerSyncUserPreferenceRow>(
      `SELECT id, identity_id, namespace, payload, revision, created_at, updated_at
       FROM user_preference_records
       WHERE identity_id = ?
       ORDER BY namespace ASC`,
      [identityId],
    );
    return rows.map((row) => PowerSyncUserPreferenceMapper.toDomain(row));
  }

  async create(document: UserPreferenceDocument): Promise<PreferenceCreateResult> {
    assertCreateRevision(document);
    const data = PowerSyncUserPreferenceMapper.toPersistence(document);
    try {
      const result = await this.db.execute(
        `INSERT INTO user_preference_records
           (id, identity_id, namespace, payload, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.identityId,
          data.namespace,
          data.payload,
          data.revision,
          data.createdAt,
          data.updatedAt,
        ],
      );
      if (result.rowsAffected !== 1) {
        throw new Error(
          `Preference insert affected ${String(result.rowsAffected)} rows instead of exactly one`,
        );
      }
      return { kind: 'created', document };
    } catch (error) {
      // PowerSync/SQLite wrappers do not expose one stable unique-error class.
      // Re-reading the canonical unique key distinguishes a concurrent winner
      // from an unrelated insert failure without swallowing the latter.
      const winner = await this.find(data.identityId, data.namespace);
      if (!winner) throw error;
      return { kind: 'exists', document: winner };
    }
  }

  async compareAndSwap(
    document: UserPreferenceDocument,
    expectedRevision: number,
  ): Promise<PreferenceCompareAndSwapResult> {
    assertCasRevision(document, expectedRevision);
    const data = PowerSyncUserPreferenceMapper.toPersistence(document);
    const result = await this.db.execute(
      `UPDATE user_preference_records
       SET payload = ?, revision = ?, updated_at = ?
       WHERE identity_id = ? AND namespace = ? AND revision = ?`,
      [
        data.payload,
        data.revision,
        data.updatedAt,
        data.identityId,
        data.namespace,
        expectedRevision,
      ],
    );

    if (result.rowsAffected === 1) {
      return { kind: 'updated', document };
    }
    if (result.rowsAffected > 1) {
      throw new Error(
        `Preference CAS updated ${String(result.rowsAffected)} rows for a unique namespace key`,
      );
    }

    const latest = await this.find(data.identityId, data.namespace);
    return latest ? { kind: 'conflict', latest } : { kind: 'missing' };
  }
}
