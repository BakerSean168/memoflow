import { createHash } from 'node:crypto';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  IKnowledgeIndexRepository,
  KnowledgeIndexDiagnostics,
  KnowledgeIndexFailureRecord,
  KnowledgeIndexedNote,
} from '../../../application/ports';
import {
  scoreIndexedResource,
  toChunkArray,
  toNumberArray,
  toStringArray,
} from '../knowledge-index-value-helpers';

/** Residual 969: this adapter imports the sole knowledge-index value helpers. */
/** Soft residual 1195: scoreIndexedResource dual retired onto that sole helper. */
const LOCAL_INDEX_TABLE = 'ai_knowledge_index_entries_local';

interface LocalKnowledgeIndexRow {
  id: string;
  identity_id: string;
  repository_id: string;
  resource_id: string;
  resource_path: string;
  title: string | null;
  mime_type: string;
  content_hash: string;
  status: 'indexed' | 'failed';
  summary: string | null;
  keywords_json: string | null;
  embedding_json: string | null;
  chunks_json: string | null;
  metadata_json: string | null;
  error: string | null;
  indexed_at: number;
  last_requested_at: number | null;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseObject(value: string | null): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) }
    : {};
}

function mapIndexed(row: LocalKnowledgeIndexRow): KnowledgeIndexedNote | null {
  if (row.status !== 'indexed') return null;
  return {
    identityId: row.identity_id,
    repositoryId: row.repository_id,
    resourceId: row.resource_id,
    resourcePath: row.resource_path,
    title: row.title ?? undefined,
    mimeType: row.mime_type,
    contentHash: row.content_hash,
    summary: row.summary ?? '',
    keywords: toStringArray(parseJson(row.keywords_json)),
    embedding: toNumberArray(parseJson(row.embedding_json)),
    chunks: toChunkArray(parseJson(row.chunks_json)),
    metadata: parseObject(row.metadata_json),
  };
}

function localIndexId(identityId: string, repositoryId: string, resourceId: string): string {
  const digest = createHash('sha256')
    .update(`${identityId}\0${repositoryId}\0${resourceId}`, 'utf8')
    .digest('hex');
  return `ai-kindex-${digest}`;
}

/**
 * Desktop-only rebuildable knowledge index.
 *
 * The source of truth is the Local Vault, never the legacy Resource aggregate.
 * This local-only PowerSync table is intentionally outside the upload queue and
 * can be discarded/rebuilt at any time. Managed notes use KnowledgeDocumentId
 * as resourceId, so path changes update resourcePath without changing identity.
 */
export class AIKnowledgeIndexPowerSyncRepository implements IKnowledgeIndexRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async getDiagnostics(): Promise<KnowledgeIndexDiagnostics> {
    return {
      persistenceBackend: 'powersync-local-knowledge-index',
      persistenceStatus: 'enabled',
      vectorRecallBackend: 'local-js-hybrid',
      vectorRecallStatus: 'fallback',
      vectorRecallReason:
        'Desktop persists a device-local rebuildable index and ranks it with local lexical or hybrid retrieval.',
    };
  }

  async findRelevantNotes(
    identityId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeIndexedNote[]> {
    if (limit <= 0) return [];
    const scanLimit = query.trim().length === 0 ? limit : Math.min(Math.max(limit * 4, 40), 200);
    const rows = await this.db.getAll<LocalKnowledgeIndexRow>(
      `SELECT * FROM ${LOCAL_INDEX_TABLE}
       WHERE identity_id = ? AND status = 'indexed'
       ORDER BY last_requested_at DESC, indexed_at DESC
       LIMIT ?`,
      [identityId, scanLimit],
    );
    const indexed = rows
      .map(mapIndexed)
      .filter((note): note is KnowledgeIndexedNote => note !== null);
    if (query.trim().length === 0) return indexed.slice(0, limit);
    return indexed
      .map((resource) => ({ resource, score: scoreIndexedResource(resource, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ resource }) => resource);
  }

  async findByNoteIds(identityId: string, resourceIds: string[]): Promise<KnowledgeIndexedNote[]> {
    if (resourceIds.length === 0) return [];
    const placeholders = resourceIds.map(() => '?').join(', ');
    const rows = await this.db.getAll<LocalKnowledgeIndexRow>(
      `SELECT * FROM ${LOCAL_INDEX_TABLE}
       WHERE identity_id = ? AND resource_id IN (${placeholders})`,
      [identityId, ...resourceIds],
    );
    return rows.map(mapIndexed).filter((note): note is KnowledgeIndexedNote => note !== null);
  }

  async upsert(resource: KnowledgeIndexedNote): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `INSERT OR REPLACE INTO ${LOCAL_INDEX_TABLE} (
         id, identity_id, repository_id, resource_id, resource_path, title,
         mime_type, content_hash, status, summary, keywords_json, embedding_json,
         chunks_json, metadata_json, error, indexed_at, last_requested_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        localIndexId(resource.identityId, resource.repositoryId, resource.resourceId),
        resource.identityId,
        resource.repositoryId,
        resource.resourceId,
        resource.resourcePath,
        resource.title ?? null,
        resource.mimeType,
        resource.contentHash,
        resource.summary,
        JSON.stringify(resource.keywords),
        JSON.stringify(resource.embedding),
        JSON.stringify(resource.chunks),
        JSON.stringify(resource.metadata),
        now,
        now,
      ],
    );
  }

  async markRequested(
    identityId: string,
    resourceIds: string[],
    requestedAt: number,
  ): Promise<void> {
    if (resourceIds.length === 0) return;
    const placeholders = resourceIds.map(() => '?').join(', ');
    await this.db.execute(
      `UPDATE ${LOCAL_INDEX_TABLE}
       SET last_requested_at = ?
       WHERE identity_id = ? AND resource_id IN (${placeholders})`,
      [requestedAt, identityId, ...resourceIds],
    );
  }

  async markFailed(record: KnowledgeIndexFailureRecord): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `INSERT OR REPLACE INTO ${LOCAL_INDEX_TABLE} (
         id, identity_id, repository_id, resource_id, resource_path, title,
         mime_type, content_hash, status, summary, keywords_json, embedding_json,
         chunks_json, metadata_json, error, indexed_at, last_requested_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed', NULL, '[]', '[]', '[]', ?, ?, ?, ?)`,
      [
        localIndexId(record.identityId, record.repositoryId, record.resourceId),
        record.identityId,
        record.repositoryId,
        record.resourceId,
        record.resourcePath,
        record.title ?? null,
        record.mimeType,
        record.contentHash,
        JSON.stringify(record.metadata),
        record.error,
        now,
        now,
      ],
    );
  }

  async removeByNoteId(identityId: string, resourceId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM ${LOCAL_INDEX_TABLE} WHERE identity_id = ? AND resource_id = ?`,
      [identityId, resourceId],
    );
  }
}
