import type { ChatExecutionProviderConfig, ChatExecutionUsage } from './chat-execution.port';
import type { KnowledgeIndexedNote } from './knowledge-ingestion.port';
import type { KnowledgeDocumentRef } from '@memoflow/contracts/repository';

export interface KnowledgeQueryCitation {
  documentRef: KnowledgeDocumentRef;
  sourcePath: string;
  title?: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
}

export interface KnowledgeQueryInput {
  identityId: string;
  providerConfig: ChatExecutionProviderConfig;
  question: string;
  indexedNotes: KnowledgeIndexedNote[];
  maxCitations?: number;
  requestId?: string;
}

export interface KnowledgeQueryResult {
  answer: string;
  citations: KnowledgeQueryCitation[];
  usage: ChatExecutionUsage;
}

export interface KnowledgeExpansionInput {
  identityId: string;
  providerConfig: ChatExecutionProviderConfig;
  instruction: string;
  currentContent?: string;
  indexedNotes: KnowledgeIndexedNote[];
  maxCitations?: number;
  requestId?: string;
}

export interface KnowledgeExpansionResult {
  expandedContent: string;
  citations: KnowledgeQueryCitation[];
  usage: ChatExecutionUsage;
}

export interface IKnowledgeQueryPort {
  query(input: KnowledgeQueryInput): Promise<KnowledgeQueryResult>;
  expand(input: KnowledgeExpansionInput): Promise<KnowledgeExpansionResult>;
}
