import type { KnowledgeContextSource } from '@memoflow/ai-contracts';
import type { KnowledgeSourceNote } from './knowledge-ingestion.port';

export interface IKnowledgeSourcePort {
  listRelevantNotes(
    identityId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeSourceNote[]>;
  listIndexableNotes(identityId: string, limit: number): Promise<KnowledgeSourceNote[]>;
  getNoteBySource(
    identityId: string,
    source: KnowledgeContextSource,
  ): Promise<KnowledgeSourceNote | null>;
  getNoteById(
    identityId: string,
    knowledgeDocumentId: string,
    knowledgeSpaceId?: string,
  ): Promise<KnowledgeSourceNote | null>;
}
