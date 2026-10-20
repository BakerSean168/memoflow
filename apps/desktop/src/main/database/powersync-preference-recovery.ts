import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { isDeepStrictEqual } from 'node:util';
import {
  parsePreferenceNamespace,
  parsePreferenceNamespacePayload,
} from '@memoflow/contracts/setting';
import type { SerializedCrudOperation } from './powersync-crud';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function payload(namespace: ReturnType<typeof parsePreferenceNamespace>, value: unknown) {
  return parsePreferenceNamespacePayload(
    namespace,
    typeof value === 'string' ? JSON.parse(value) : value,
  );
}

function recoveryProof(body: unknown, ops: SerializedCrudOperation[]) {
  if (!record(body) || body.ok !== false || body.code !== 409 || !record(body.error)) return null;
  const context = body.error.context;
  if (
    body.error.code !== 'CONFLICT' ||
    !record(context) ||
    context.code !== 'preference_revision_conflict' ||
    context.reason !== 'canonical_id_mismatch' ||
    context.expectedRevision !== 0 ||
    typeof context.identityId !== 'string' ||
    !context.identityId ||
    typeof context.canonicalId !== 'string' ||
    !context.canonicalId ||
    !record(context.latest)
  )
    return null;
  const namespace = parsePreferenceNamespace(String(context.namespace));
  const latest = context.latest;
  if (latest.namespace !== namespace || latest.revision !== 1) return null;
  const canonicalPayload = payload(namespace, latest.preferences);
  const candidates = ops.filter(
    (op) =>
      op.type === 'user_preference_records' &&
      op.op === 'PUT' &&
      record(op.data) &&
      op.data.namespace === namespace,
  );
  if (candidates.length !== 1) return null;
  const operation = candidates[0]!;
  const data = operation.data;
  if (
    !record(data) ||
    data.identity_id !== context.identityId ||
    data.revision !== 1 ||
    operation.id === context.canonicalId ||
    !Number.isSafeInteger(operation.op_id) ||
    !isDeepStrictEqual(payload(namespace, data.payload), canonicalPayload)
  )
    return null;
  return {
    operation,
    namespace,
    identityId: context.identityId,
    canonicalId: context.canonicalId,
    canonicalPayload,
    latest,
  };
}

interface QueueRow {
  id: number;
  tx_id: number | null;
  data: string;
}
interface LocalRow {
  id: string;
  data: string;
}

/**
 * Narrow SDK-internal adapter, tested against the installed Node SDK/SQLite.
 * Public PowerSync views reject ID updates. Ordinary DELETE/INSERT would enqueue
 * destructive remote CRUD instead. This transaction changes ONLY row identity;
 * it never acknowledges or deletes a CRUD entry, and preserves its order/tx_id.
 * Any validation failure leaves every row and offline edit untouched.
 */
export async function recoverPreferenceCanonicalId(
  database: Pick<AbstractPowerSyncDatabase, 'writeTransaction'>,
  ops: SerializedCrudOperation[],
  body: unknown,
): Promise<boolean> {
  let proof;
  try {
    proof = recoveryProof(body, ops);
  } catch {
    return false;
  }
  if (!proof) return false;
  const { operation, namespace, identityId, canonicalId, canonicalPayload, latest } = proof;
  return database.writeTransaction(async (tx) => {
    const head = await tx.getOptional<QueueRow>(
      'SELECT id, tx_id, data FROM ps_crud WHERE id = ?',
      [operation.op_id],
    );
    if (!head || head.tx_id !== (operation.tx_id ?? null)) return false;
    const original: unknown = JSON.parse(head.data);
    if (
      !record(original) ||
      original.id !== operation.id ||
      original.op !== 'PUT' ||
      original.type !== 'user_preference_records' ||
      !isDeepStrictEqual(original.data, operation.data)
    )
      return false;

    const local = await tx.getOptional<LocalRow>(
      'SELECT id, data FROM ps_data__user_preference_records WHERE id = ?',
      [operation.id],
    );
    if (!local) return false;
    const localData: unknown = JSON.parse(local.data);
    if (
      !record(localData) ||
      localData.identity_id !== identityId ||
      localData.namespace !== namespace
    )
      return false;
    const canonical = await tx.getOptional<LocalRow>(
      'SELECT id, data FROM ps_data__user_preference_records WHERE id = ?',
      [canonicalId],
    );
    if (canonical) {
      const data: unknown = JSON.parse(canonical.data);
      if (
        !record(data) ||
        data.identity_id !== identityId ||
        data.namespace !== namespace ||
        data.revision !== 1 ||
        !isDeepStrictEqual(payload(namespace, data.payload), canonicalPayload)
      )
        return false;
    }
    const siblings = await tx.getAll<{ id: string }>(
      'SELECT id FROM user_preference_records WHERE identity_id = ? AND namespace = ?',
      [identityId, namespace],
    );
    if (siblings.some((row) => row.id !== operation.id && row.id !== canonicalId)) return false;
    const canonicalQueued = await tx.getOptional<{ id: number }>(
      `SELECT id FROM ps_crud WHERE json_extract(data, '$.type') = 'user_preference_records'
       AND json_extract(data, '$.id') = ? LIMIT 1`,
      [canonicalId],
    );
    if (canonicalQueued) return false;

    const queued = await tx.getAll<QueueRow>(
      `SELECT id, tx_id, data FROM ps_crud WHERE json_extract(data, '$.type') = 'user_preference_records'
       AND json_extract(data, '$.id') = ? ORDER BY id`,
      [operation.id],
    );
    // Validate the entire old-ID edit chain before any mutation. A later invalid
    // operation must not result in a partially migrated row or queue.
    let revision = 0;
    let finalPayload: unknown;
    for (const row of queued) {
      const entry: unknown = JSON.parse(row.data);
      if (
        !record(entry) ||
        !record(entry.data) ||
        row.id < head.id ||
        entry.op !== (revision === 0 ? 'PUT' : 'PATCH')
      )
        return false;
      const data = entry.data;
      if (
        (data.identity_id !== undefined && data.identity_id !== identityId) ||
        (data.namespace !== undefined && data.namespace !== namespace) ||
        data.revision !== revision + 1
      )
        return false;
      finalPayload = payload(namespace, data.payload);
      revision++;
    }
    if (
      revision === 0 ||
      localData.revision !== revision ||
      !isDeepStrictEqual(payload(namespace, localData.payload), finalPayload)
    )
      return false;

    await tx.execute(`CREATE TABLE IF NOT EXISTS desktop_preference_id_migrations (
      identity_id TEXT NOT NULL, old_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
      receipt TEXT NOT NULL, PRIMARY KEY(identity_id, old_id))`);
    const existing = await tx.getOptional<{ canonical_id: string }>(
      'SELECT canonical_id FROM desktop_preference_id_migrations WHERE identity_id = ? AND old_id = ?',
      [identityId, operation.id],
    );
    // A committed migration has no old-ID row/CRUD left. Its journal must not
    // be reused to authorize an unexpectedly resurrected old ID.
    if (existing) return false;
    // Durable proof + originals, committed atomically with the ID migration.
    // Profile DB ownership scopes this journal; no payload is written to logs.
    await tx.execute(
      `INSERT INTO desktop_preference_id_migrations(identity_id, old_id, canonical_id, receipt)
       VALUES (?, ?, ?, ?)`,
      [
        identityId,
        operation.id,
        canonicalId,
        JSON.stringify({
          namespace,
          latest,
          local,
          canonical,
          queued,
        }),
      ],
    );
    await tx.execute(
      `INSERT INTO ps_data__user_preference_records(id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [canonicalId, local.data],
    );
    await tx.execute('DELETE FROM ps_data__user_preference_records WHERE id = ?', [operation.id]);
    for (const row of queued) {
      await tx.execute(`UPDATE ps_crud SET data = json_set(data, '$.id', ?) WHERE id = ?`, [
        canonicalId,
        row.id,
      ]);
    }
    await tx.execute(
      `INSERT OR IGNORE INTO ps_updated_rows(row_type, row_id) VALUES ('user_preference_records', ?)`,
      [canonicalId],
    );
    await tx.execute(
      `DELETE FROM ps_updated_rows WHERE row_type = 'user_preference_records' AND row_id = ?`,
      [operation.id],
    );
    return true;
  });
}
