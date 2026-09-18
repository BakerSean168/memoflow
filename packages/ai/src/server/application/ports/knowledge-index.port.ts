import type { KnowledgeIndexedNote } from './knowledge-ingestion.port';

export interface KnowledgeIndexDiagnostics {
  persistenceBackend: 'powersync-local-knowledge-index' | 'prisma-index-table';
  persistenceStatus: 'enabled' | 'fallback';
  persistenceReason?: string;
  vectorRecallBackend: 'none' | 'local-js-hybrid' | 'pgvector-ivfflat';
  vectorRecallStatus: 'enabled' | 'fallback' | 'unknown';
  vectorRecallReason?: string;
}

export interface KnowledgeIndexFailureRecord {
  identityId: string;
  repositoryId: string;
  knowledgeSpaceId: string;
  knowledgeDocumentId: string;
  sourcePath: string;
  sourceContentHash: string;
  sourceVersion?: string | null;
  title?: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  error: string;
}

export interface KnowledgeDocumentIndexRef {
  knowledgeSpaceId: string;
  knowledgeDocumentId: string;
}

export interface IKnowledgeIndexRepository {
  getDiagnostics(): Promise<KnowledgeIndexDiagnostics>;
  findByDocumentRefs(
    identityId: string,
    documentRefs: KnowledgeDocumentIndexRef[],
  ): Promise<KnowledgeIndexedNote[]>;
  findRelevantNotes(
    identityId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeIndexedNote[]>;
  upsert(resource: KnowledgeIndexedNote): Promise<void>;
  markRequested(
    identityId: string,
    documentRefs: KnowledgeDocumentIndexRef[],
    requestedAt: number,
  ): Promise<void>;
  markFailed(record: KnowledgeIndexFailureRecord): Promise<void>;
  removeByDocumentRef(identityId: string, documentRef: KnowledgeDocumentIndexRef): Promise<void>;
}
