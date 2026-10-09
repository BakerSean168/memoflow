import { ResultErrorException } from '@memoflow/contracts/result';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { ProfileImportBlocker } from '@memoflow/contracts/data-portability';
import { profileImportDigest } from '@memoflow/data-portability';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';

// Reviewed owner facts represented by V3. Everything else is retained by default.
const portableTables = new Set([
  'accounts',
  'user_preference_records',
  'goals',
  'key_results',
  'goal_records',
  'goal_reviews',
  'labels',
  'goal_labels',
  'task_labels',
  'task_plans',
  'task_occurrences',
  'schedules',
  'routine_definitions',
  'routine_preferences',
  'routine_profiles',
  'routine_profile_memberships',
  'routine_occurrences',
  'routine_interactions',
  'routine_temporary_overrides',
  'notifications',
  'notification_interactions',
  'notification_preferences',
  'ai_conversations',
]);
const technicalTables = new Set([
  'goal_operation_receipts',
  'account_profile_sync_outbox',
  'scheduling_reconcile_operations',
  'scheduled_invocations',
  'invocation_attempts',
  'schedule_domain_event_outbox',
  'notification_delivery_decisions',
  'notification_dispatch_outbox',
  'desktop_delivery_acks',
  'task_goal_outbox',
  'ai_knowledge_index_entries_local',
]);
const powerSyncInternalTables = new Set([
  'ps_buckets',
  'ps_crud',
  'ps_kv',
  'ps_migration',
  'ps_oplog',
  'ps_stream_subscriptions',
  'ps_sync_state',
  'ps_tx',
  'ps_updated_rows',
]);
const technicalFiles = new Set([
  'db/powersync.sqlite',
  'db/powersync.sqlite-wal',
  'db/powersync.sqlite-shm',
  'db/snapshot-meta.json',
  'ui/main-window-state.json',
]);

/** Content proofs stay in the host; neither raw rows nor filenames are uploaded. */
export async function inspectProfileSource(db: IElectronDatabase, profileDir: string) {
  const blockers: ProfileImportBlocker[] = [];
  const proof: { name: string; digest: string }[] = [];
  const block = (field: string, reason: ProfileImportBlocker['reason'] = 'unsupported_user_data') =>
    blockers.push({ capability: 'local-source', reason, field });
  const tables = z
    .array(z.object({ name: z.string() }))
    .parse(
      await db.getAll(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    );
  const names = new Set(tables.map((table) => table.name));
  for (const { name } of tables) {
    // PowerSync internal storage backs logical views; inspect each view once.
    if (powerSyncInternalTables.has(name)) continue;
    if (/^ps_data(?:_local)?__/.test(name)) {
      const logical = name.replace(/^ps_data(?:_local)?__/, '');
      if (!names.has(logical)) block(name, 'unknown');
      continue;
    }
    const quoted = '"' + name.replace(/"/g, '""') + '"';
    const rows = z
      .array(z.record(z.string(), z.unknown()))
      .parse(await db.getAll(`SELECT * FROM ${quoted} LIMIT 10001`));
    if (rows.length > 10000)
      throw new ResultErrorException('SOURCE_INVENTORY_LIMIT', 'SOURCE_INVENTORY_LIMIT');
    const normalized = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          Buffer.isBuffer(value) ? { binary: value.toString('base64') } : value,
        ]),
      ),
    );
    proof.push({ name, digest: profileImportDigest(normalized.map(profileImportDigest).sort()) });
    if (!rows.length) continue;
    if (!portableTables.has(name) && !technicalTables.has(name)) block(name);
    if (rows.some((row) => row.deleted_at != null)) block(`${name}:deleted-facts`);
    if (
      name === 'notifications' &&
      rows.some(
        (row) =>
          row.related_entity_id != null ||
          (row.navigation_intent != null && row.navigation_intent !== 'null') ||
          row.correlation_id != null ||
          row.causation_id != null ||
          (row.actions != null &&
            z
              .array(z.object({ kind: z.string() }).passthrough())
              .parse(JSON.parse(String(row.actions)))
              .some((action) => action.kind !== 'archive')),
      )
    )
      block('notifications:links-and-actions');
    if (
      name === 'notification_interactions' &&
      rows.some(
        (row) =>
          row.command_receipt_id != null || row.correlation_id != null || row.causation_id != null,
      )
    )
      block('notification_interactions:command-links');
    if (
      name === 'notification_preferences' &&
      rows.some((row) => row.quiet_hours != null && row.quiet_hours !== 'null')
    )
      block('notification_preferences:quiet-hours');
    if (
      name === 'notifications' &&
      rows.some(
        (row) =>
          row.metadata != null &&
          Object.entries(
            z.record(z.string(), z.unknown()).parse(JSON.parse(String(row.metadata))),
          ).some(([key, value]) => !['icon', 'image', 'color'].includes(key) && value != null),
      )
    )
      block('notifications:metadata');
    if (name === 'goals' && rows.some((row) => row.sort_order != null && row.sort_order !== 0))
      block('goals:custom-order');
    if (name === 'key_results' && rows.some((row) => row.order != null && row.order !== 0))
      block('key_results:custom-order');
    if (
      name === 'goal_records' &&
      rows.some(
        (row) => row.source_id != null || (row.authorship != null && row.authorship !== 'Manual'),
      )
    )
      block('goal_records:authorship');
    // Pending reliable work cannot be discarded even when its table is technical.
    if (
      ['task_goal_outbox', 'notification_dispatch_outbox'].includes(name) &&
      rows.some((row) =>
        ['pending', 'processing', 'failed'].includes(String(row.status).toLowerCase()),
      )
    )
      block(`${name}:pending-work`);
  }
  let fileCount = 0;
  let bytes = 0;
  let inspectedMastra = false;
  const mastraPath = path.join(profileDir, 'storage', 'mastra.db');
  try {
    if (
      (await fs.lstat(path.dirname(mastraPath))).isDirectory() &&
      (await fs.lstat(mastraPath)).isFile()
    ) {
      await readProfileSqliteSnapshot(mastraPath, async (snapshot) => {
        const tables = z
          .array(z.object({ name: z.string() }))
          .parse(
            await snapshot.getAll(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            ),
          );
        const content: { name: string; digest: string }[] = [];
        for (const { name } of tables) {
          const quoted = '"' + name.replace(/"/g, '""') + '"';
          const rows = z
            .array(z.record(z.string(), z.unknown()))
            .parse(await snapshot.getAll(`SELECT * FROM ${quoted} LIMIT 10001`));
          if (rows.length > 10000)
            throw new ResultErrorException('SOURCE_INVENTORY_LIMIT', 'SOURCE_INVENTORY_LIMIT');
          if (rows.length) block('storage/mastra.db');
          content.push({
            name,
            digest: profileImportDigest(
              rows
                .map((row) =>
                  profileImportDigest(
                    Object.fromEntries(
                      Object.entries(row).map(([key, value]) => [
                        key,
                        Buffer.isBuffer(value) ? value.toString('base64') : value,
                      ]),
                    ),
                  ),
                )
                .sort(),
            ),
          });
        }
        proof.push({ name: 'storage/mastra.db', digest: profileImportDigest(content) });
      });
      inspectedMastra = true;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++fileCount > 10000)
        throw new ResultErrorException('SOURCE_INVENTORY_LIMIT', 'SOURCE_INVENTORY_LIMIT');
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(profileDir, absolute).split(path.sep).join('/');
      if (
        inspectedMastra &&
        ['storage/mastra.db', 'storage/mastra.db-wal', 'storage/mastra.db-shm'].includes(relative)
      )
        continue;
      if (entry.isSymbolicLink()) {
        block(relative);
        proof.push({ name: relative, digest: profileImportDigest(await fs.readlink(absolute)) });
      } else if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && !technicalFiles.has(relative)) {
        const stat = await fs.stat(absolute);
        bytes += stat.size;
        if (bytes > 512 * 1024 * 1024)
          throw new ResultErrorException('SOURCE_INVENTORY_LIMIT', 'SOURCE_INVENTORY_LIMIT');
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(absolute)) hash.update(chunk);
        proof.push({ name: relative, digest: hash.digest('hex') });
        block(relative);
      } else if (!entry.isFile()) block(relative, 'unknown');
    }
  }
  await walk(profileDir);
  return {
    digest: profileImportDigest(proof.sort((a, b) => a.name.localeCompare(b.name))),
    blockers,
  };
}
