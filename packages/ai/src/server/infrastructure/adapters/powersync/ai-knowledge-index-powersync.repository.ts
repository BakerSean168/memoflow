import { createHash } from 'node:crypto';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  IKnowledgeIndexRepository,
  KnowledgeIndexDiagnostics,
  KnowledgeIndexFailureRecord,
  KnowledgeIndexedNote,
  KnowledgeDocumentIndexRef,
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
  knowledge_space_id: string;
  knowledge_document_id: string;
  source_path: string;
  title: string | null;
  mime_type: string;
  source_content_hash: string;
  source_version: string | null;
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
    knowledgeSpaceId: row.knowledge_space_id,
    knowledgeDocumentId: row.knowledge_document_id,
    sourcePath: row.source_path,
    sourceContentHash: row.source_content_hash,
    sourceVersion: row.source_version,
    title: row.title ?? undefined,
    mimeType: row.mime_type,
    summary: row.summary ?? '',
    keywords: toStringArray(parseJson(row.keywords_json)),
    embedding: toNumberArray(parseJson(row.embedding_json)),
    chunks: toChunkArray(parseJson(row.chunks_json)),
    metadata: parseObject(row.metadata_json),
  };
}

function localIndexId(
  identityId: string,
  knowledgeSpaceId: string,
  knowledgeDocumentId: string,
): string {
  const digest = createHash('sha256')
    .update(`${identityId}\0${knowledgeSpaceId}\0${knowledgeDocumentId}`, 'utf8')
    .digest('hex');
  return `ai-kindex-${digest}`;
}

/**
 * Desktop-only rebuildable knowledge index.
 *
 * The source of truth is the Local Vault, never the legacy Resource aggregate.
 * This local-only PowerSync table is intentionally outside the upload queue and
 * can be discarded/rebuilt at any time. Managed notes use KnowledgeDocumentId
 * as knowledgeDocumentId, so path changes update sourcePath without changing identity.
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

  async findByDocumentRefs(
    identityId: string,
    documentRefs: KnowledgeDocumentIndexRef[],
  ): Promise<KnowledgeIndexedNote[]> {
    if (documentRefs.length === 0) return [];
    const clauses = documentRefs.map(
      () => '(knowledge_space_id = ? AND knowledge_document_id = ?)',
    );
    const rows = await this.db.getAll<LocalKnowledgeIndexRow>(
      `SELECT * FROM ${LOCAL_INDEX_TABLE}
       WHERE identity_id = ? AND (${clauses.join(' OR ')})`,
      [
        identityId,
        ...documentRefs.flatMap((ref) => [ref.knowledgeSpaceId, ref.knowledgeDocumentId]),
      ],
    );
    return rows.map(mapIndexed).filter((note): note is KnowledgeIndexedNote => note !== null);
  }

  async upsert(resource: KnowledgeIndexedNote): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `INSERT OR REPLACE INTO ${LOCAL_INDEX_TABLE} (
         id, identity_id, repository_id, knowledge_space_id, knowledge_document_id, source_path, title,
         mime_type, source_content_hash, source_version, status, summary, keywords_json, embedding_json,
         chunks_json, metadata_json, error, indexed_at, last_requested_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, ?, ?, ?, NULL, ?, ?)`,
      [
        localIndexId(resource.identityId, resource.knowledgeSpaceId, resource.knowledgeDocumentId),
        resource.identityId,
        resource.repositoryId,
        resource.knowledgeSpaceId,
        resource.knowledgeDocumentId,
        resource.sourcePath,
        resource.title ?? null,
        resource.mimeType,
        resource.sourceContentHash,
        resource.sourceVersion ?? null,
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
    documentRefs: KnowledgeDocumentIndexRef[],
    requestedAt: number,
  ): Promise<void> {
    if (documentRefs.length === 0) return;
    const clauses = documentRefs.map(
      () => '(knowledge_space_id = ? AND knowledge_document_id = ?)',
    );
    await this.db.execute(
      `UPDATE ${LOCAL_INDEX_TABLE}
       SET last_requested_at = ?
       WHERE identity_id = ? AND (${clauses.join(' OR ')})`,
      [
        requestedAt,
        identityId,
        ...documentRefs.flatMap((ref) => [ref.knowledgeSpaceId, ref.knowledgeDocumentId]),
      ],
    );
  }

  async markFailed(record: KnowledgeIndexFailureRecord): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `INSERT OR REPLACE INTO ${LOCAL_INDEX_TABLE} (
         id, identity_id, repository_id, knowledge_space_id, knowledge_document_id, source_path, title,
         mime_type, source_content_hash, source_version, status, summary, keywords_json, embedding_json,
         chunks_json, metadata_json, error, indexed_at, last_requested_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', NULL, '[]', '[]', '[]', ?, ?, ?, ?)`,
      [
        localIndexId(record.identityId, record.knowledgeSpaceId, record.knowledgeDocumentId),
        record.identityId,
        record.repositoryId,
        record.knowledgeSpaceId,
        record.knowledgeDocumentId,
        record.sourcePath,
        record.title ?? null,
        record.mimeType,
        record.sourceContentHash,
        record.sourceVersion ?? null,
        JSON.stringify(record.metadata),
        record.error,
        now,
        now,
      ],
    );
  }

  async removeByDocumentRef(
    identityId: string,
    documentRef: KnowledgeDocumentIndexRef,
  ): Promise<void> {
    await this.db.execute(
      `DELETE FROM ${LOCAL_INDEX_TABLE}
       WHERE identity_id = ? AND knowledge_space_id = ? AND knowledge_document_id = ?`,
      [identityId, documentRef.knowledgeSpaceId, documentRef.knowledgeDocumentId],
    );
  }
}
