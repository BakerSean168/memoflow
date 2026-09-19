import { createHash } from 'node:crypto';
import type {
  IAIExecutionRecordPort,
  KnowledgeSourceNote,
  KnowledgeIndexedNote,
} from '../../ports';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('AIKnowledgeIndexHelpers');

export interface SyncKnowledgeNotesOptions {
  force?: boolean;
  requestId?: string;
  providerConfig?: import('../../ports').ChatExecutionProviderConfig;
}

export interface SyncKnowledgeNotesResult {
  indexedNotes: KnowledgeIndexedNote[];
  indexedCount: number;
  reusedCount: number;
  failedCount: number;
  results: Array<{
    knowledgeDocumentId: string;
    sourcePath: string;
    status: 'indexed' | 'reused' | 'failed';
    error?: string;
  }>;
}

export interface SyncKnowledgeNoteByIdResult {
  note: KnowledgeSourceNote | null;
  sync: SyncKnowledgeNotesResult | null;
}

export function mergeUniqueNotes(resources: KnowledgeSourceNote[]): KnowledgeSourceNote[] {
  const seen = new Set<string>();
  const merged: KnowledgeSourceNote[] = [];

  for (const resource of resources) {
    if (!resource.knowledgeDocumentId) {
      continue;
    }
    const key = `${resource.knowledgeSpaceId}\0${resource.knowledgeDocumentId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(resource);
  }

  return merged;
}

export function resolveSourceContentHash(resource: KnowledgeSourceNote): string {
  if (resource.sourceContentHash.length > 0) {
    return resource.sourceContentHash;
  }
  const metadataHash = resource.metadata?.['contentDigest'];
  if (typeof metadataHash === 'string' && metadataHash.length > 0) {
    return metadataHash;
  }

  return createHash('sha256').update(resource.content).digest('hex');
}

export async function recordExecution(
  executionRecordPort: IAIExecutionRecordPort | undefined,
  input: Parameters<NonNullable<IAIExecutionRecordPort['record']>>[0],
): Promise<void> {
  if (!executionRecordPort) {
    return;
  }

  try {
    await executionRecordPort.record(input);
  } catch (error) {
    logger.warn('Failed to record knowledge indexing execution log', {
      error,
      operation: input.operation,
    });
  }
}
