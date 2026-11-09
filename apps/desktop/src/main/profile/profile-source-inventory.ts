import { ResultErrorException } from '@memoflow/transport-contracts/result';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import type { ArchiveManifest, ProfileImportBlocker } from '@memoflow/data-portability-contracts';
import { profileImportDigest } from '@memoflow/data-portability';
import {
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import { mastraTimestampToMs } from './desktop-message-archive';
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
  'account_profile_sync_snapshot',
  'scheduling_reconcile_operations',
  'scheduled_invocations',
  'invocation_attempts',
  'schedule_domain_event_outbox',
  'notification_delivery_decisions',
  'notification_dispatch_outbox',
  'desktop_delivery_acks',
  'task_goal_outbox',
  'ai_knowledge_index_entries_local',
  'ai_conversation_event_metadata',
  'ai_conversation_event_heads',
  'ai_conversation_event_states',
  'ai_conversation_event_log',
  'ai_attention_event_metadata',
  'ai_attention_event_heads',
  'ai_attention_event_states',
  'ai_attention_event_log',
  'ai_permission_settings_local',
  'ai_permission_rules_local',
  'ai_permission_audit_local',
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
export interface ProfileSourceMessageCoverage {
  readonly manifest: ArchiveManifest;
  /** Maps live Mastra threads to the portable conversation refs in the manifest. */
  readonly refsByThreadId: readonly { readonly threadId: string; readonly ref: string }[];
}

export interface InspectProfileSourceOptions {
  /** Manifest produced by the same export that created the inventory. */
  readonly messages?: ProfileSourceMessageCoverage | null;
}

function isRuntimeEpoch(rows: readonly Record<string, unknown>[]): boolean {
  return (
    rows.length === 1 &&
    Object.keys(rows[0]!).sort().join(',') === 'epoch,id' &&
    rows[0]!.id === 1 &&
    z.uuid().safeParse(rows[0]!.epoch).success
  );
}

/** `null` is what Mastra writes when a thread has no metadata; `{}` is the explicit empty value. */
function isEmptyThreadMetadata(value: unknown): boolean {
  if (value == null) return true;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed as Record<string, unknown>).length === 0
    );
  } catch {
    return false;
  }
}

interface MastraMessageInput {
  readonly id: string;
  readonly role: string;
  readonly type: string;
  readonly content: string;
  readonly createdAt: number;
}

function readMastraMessage(row: Record<string, unknown>): MastraMessageInput | null {
  const { id, role, type, content } = row;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof role !== 'string' ||
    role.length === 0 ||
    typeof type !== 'string' ||
    type.length === 0 ||
    typeof content !== 'string'
  )
    return null;
  try {
    return { id, role, type, content, createdAt: mastraTimestampToMs(row.createdAt) };
  } catch {
    return null;
  }
}

function toArchiveMessageLines(
  ref: string,
  rows: readonly Record<string, unknown>[],
): ArchiveMessageLineV1[] | null {
  const messages: MastraMessageInput[] = [];
  for (const row of rows) {
    const message = readMastraMessage(row);
    if (!message) return null;
    messages.push(message);
  }
  messages.sort(
    (left, right) =>
      left.createdAt - right.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  return messages.map((message, ordinal) => ({
    k: 'message',
    v: 1,
    ref,
    ordinal,
    sid: message.id,
    role: message.role,
    type: message.type,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

export async function inspectProfileSource(
  db: IElectronDatabase,
  profileDir: string,
  options: InspectProfileSourceOptions = {},
) {
  const blockers: ProfileImportBlocker[] = [];
  const proof: { name: string; digest: string }[] = [];
  const block = (field: string, reason: ProfileImportBlocker['reason'] = 'unsupported_user_data') =>
    blockers.push({ capability: 'local-source', reason, field });
  const blocked = new Set<string>();
  const blockOnce = (
    field: string,
    reason: ProfileImportBlocker['reason'] = 'unsupported_user_data',
  ) => {
    const key = `${field}\u0000${reason}`;
    if (blocked.has(key)) return;
    blocked.add(key);
    block(field, reason);
  };
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
        const listedTables = z
          .array(z.object({ name: z.string() }))
          .parse(
            await snapshot.getAll(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            ),
          );
        const content: { name: string; digest: string }[] = [];
        const rowsByTable = new Map<string, Record<string, unknown>[]>();
        for (const { name } of listedTables) {
          const quoted = '"' + name.replace(/"/g, '""') + '"';
          const rows = z
            .array(z.record(z.string(), z.unknown()))
            .parse(await snapshot.getAll(`SELECT * FROM ${quoted} LIMIT 10001`));
          if (rows.length > 10000)
            throw new ResultErrorException('SOURCE_INVENTORY_LIMIT', 'SOURCE_INVENTORY_LIMIT');
          rowsByTable.set(name, rows);
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

        const coverage = options.messages ?? null;
        const expectedByRef = new Map(
          (coverage?.manifest.threads ?? []).map((thread) => [thread.conversationRef, thread]),
        );
        const refsByThreadId = new Map(
          (coverage?.refsByThreadId ?? []).map((entry) => [entry.threadId, entry.ref]),
        );

        const threadRows = rowsByTable.get('mastra_threads') ?? [];
        const messageRows = rowsByTable.get('mastra_messages') ?? [];
        const threadIds = new Set(threadRows.map((row) => String(row.id ?? '')));
        const messagesByThread = new Map<string, Record<string, unknown>[]>();
        let orphanThread = false;
        for (const row of messageRows) {
          const threadId = typeof row.thread_id === 'string' ? row.thread_id : '';
          if (!threadId || !threadIds.has(threadId)) {
            orphanThread = true;
            continue;
          }
          const list = messagesByThread.get(threadId);
          if (list) list.push(row);
          else messagesByThread.set(threadId, [row]);
        }

        let uncovered = false;
        const seenRefs = new Set<string>();
        for (const thread of threadRows) {
          const threadId = typeof thread.id === 'string' ? thread.id : '';
          if (!threadId) {
            uncovered = true;
            continue;
          }
          // A thread's metadata is not part of the transcript archive; any
          // non-empty value is an uncovered fact retained with the source.
          if (!isEmptyThreadMetadata(thread.metadata)) uncovered = true;
          const messages = messagesByThread.get(threadId) ?? [];
          const ref = refsByThreadId.get(threadId);
          if (!ref) {
            // Messages without a live conversation shell cannot be exported.
            if (messages.length) orphanThread = true;
            continue;
          }
          if (!messages.length) {
            if (expectedByRef.has(ref)) uncovered = true;
            continue;
          }
          const lines = toArchiveMessageLines(ref, messages);
          if (!lines) {
            uncovered = true;
            continue;
          }
          const entry = computeThreadManifestEntry(ref, lines);
          const expected = expectedByRef.get(ref);
          if (
            !expected ||
            expected.messageCount !== entry.messageCount ||
            expected.digest !== entry.digest
          ) {
            uncovered = true;
            continue;
          }
          seenRefs.add(ref);
        }
        if (seenRefs.size !== expectedByRef.size) uncovered = true;

        for (const [name, rows] of rowsByTable) {
          if (!rows.length) continue;
          if (name === 'mastra_threads' || name === 'mastra_messages') continue;
          if (name === 'mastra_resources') {
            blockOnce('storage/mastra.db', 'storage/mastra.db:resources');
            continue;
          }
          if (name === 'mastra_workflow_snapshot') {
            // A 案: runtime state is explicitly excluded, with its own reason so
            // users can distinguish it from an unrecognized table (design §6/§2.7).
            blockOnce('storage/mastra.db', 'storage/mastra.db:unsupported-runtime-state');
            continue;
          }
          // Only the startup-generated stream epoch is disposable metadata.
          if (name === 'memoflow_goal_event_meta' && isRuntimeEpoch(rows)) continue;
          block('storage/mastra.db');
        }
        if (uncovered) blockOnce('storage/mastra.db', 'storage/mastra.db:messages-uncovered');
        if (orphanThread) blockOnce('storage/mastra.db', 'storage/mastra.db:orphan-thread');

        // Changing the transcript after export must always change the inventory.
        proof.push({
          name: 'storage/mastra.db:archive',
          digest: coverage?.manifest.archive.digest ?? profileImportDigest(null),
        });
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
      } else if (
        entry.isFile() &&
        !technicalFiles.has(relative) &&
        !/^storage\/local-agents\/model-catalog\/[a-f0-9]{64}\.json(?:\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp)?$/.test(
          relative,
        )
      ) {
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
