import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  IAIExecutionLogPort,
  IKnowledgeIndexRepository,
  IKnowledgeIngestionPort,
  KnowledgeSourceNote,
  KnowledgeIndexedNote,
} from '../../ports';
import { createLogger } from '@memoflow/utils/logger';
import {
  resolveSourceContentHash,
  recordExecution,
  type SyncKnowledgeNotesOptions,
  type SyncKnowledgeNotesResult,
} from './ai-knowledge-index-helpers';

const logger = createLogger('SyncKnowledgeNotesUseCase');

/**
 * 同步知识笔记索引
 */
export class SyncKnowledgeNotesUseCase {
  constructor(
    private readonly knowledgeIndexRepository: IKnowledgeIndexRepository,
    private readonly knowledgeIngestionPort: IKnowledgeIngestionPort,
    private readonly executionLogPort?: IAIExecutionLogPort,
  ) {}

  async execute(
    resources: KnowledgeSourceNote[],
    cx: ExecutionContext,
    options?: SyncKnowledgeNotesOptions,
  ): Promise<SyncKnowledgeNotesResult> {
    const stableResources = resources.filter(
      (
        resource,
      ): resource is KnowledgeSourceNote & {
        knowledgeDocumentId: NonNullable<KnowledgeSourceNote['knowledgeDocumentId']>;
      } => resource.knowledgeDocumentId !== null,
    );
    if (stableResources.length === 0) {
      return {
        indexedNotes: [],
        indexedCount: 0,
        reusedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const requestedAt = Date.now();
    const documentRefs = stableResources.map((resource) => ({
      knowledgeSpaceId: resource.knowledgeSpaceId,
      knowledgeDocumentId: resource.knowledgeDocumentId,
    }));
    const cachedResources = await this.knowledgeIndexRepository.findByDocumentRefs(
      cx.identityId,
      documentRefs,
    );
    const cachedByDocumentRef = new Map<string, KnowledgeIndexedNote>(
      cachedResources.map(
        (resource) =>
          [`${resource.knowledgeSpaceId}\0${resource.knowledgeDocumentId}`, resource] as const,
      ),
    );

    const indexedNotes: KnowledgeIndexedNote[] = [];
    const results: SyncKnowledgeNotesResult['results'] = [];
    let indexedCount = 0;
    let reusedCount = 0;
    let failedCount = 0;

    for (const resource of stableResources) {
      const cacheKey = `${resource.knowledgeSpaceId}\0${resource.knowledgeDocumentId}`;
      const cached = cachedByDocumentRef.get(cacheKey);
      const sourceContentHash = resolveSourceContentHash(resource);
      const canReuse = !options?.force && cached && cached.sourceContentHash === sourceContentHash;

      if (canReuse && cached) {
        const refreshed = {
          ...cached,
          repositoryId: resource.repositoryId,
          knowledgeSpaceId: resource.knowledgeSpaceId,
          sourcePath: resource.sourcePath,
          sourceContentHash,
          sourceVersion: resource.sourceVersion,
          title: resource.title,
          mimeType: resource.mimeType,
          metadata: { ...cached.metadata, ...(resource.metadata ?? {}) },
        } satisfies KnowledgeIndexedNote;
        await this.knowledgeIndexRepository.upsert(refreshed);
        indexedNotes.push(refreshed);
        results.push({
          knowledgeDocumentId: resource.knowledgeDocumentId,
          sourcePath: resource.sourcePath,
          status: 'reused',
        });
        reusedCount += 1;
        continue;
      }

      try {
        const indexed = await this.knowledgeIngestionPort.indexNote({
          note: resource,
          providerConfig: options?.providerConfig,
        });
        await this.knowledgeIndexRepository.upsert(indexed);
        indexedNotes.push(indexed);
        results.push({
          knowledgeDocumentId: resource.knowledgeDocumentId,
          sourcePath: resource.sourcePath,
          status: 'indexed',
        });
        indexedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to index knowledge note';
        failedCount += 1;
        results.push({
          knowledgeDocumentId: resource.knowledgeDocumentId,
          sourcePath: resource.sourcePath,
          status: 'failed',
          error: message,
        });
        logger.error('Knowledge indexing failed', {
          error,
          identityId: cx.identityId,
          knowledgeDocumentId: resource.knowledgeDocumentId,
          sourcePath: resource.sourcePath,
        });

        await this.knowledgeIndexRepository.markFailed({
          identityId: cx.identityId,
          repositoryId: resource.repositoryId,
          knowledgeSpaceId: resource.knowledgeSpaceId,
          knowledgeDocumentId: resource.knowledgeDocumentId,
          sourcePath: resource.sourcePath,
          sourceContentHash,
          sourceVersion: resource.sourceVersion,
          title: resource.title,
          mimeType: resource.mimeType,
          metadata: resource.metadata ?? {},
          error: message,
        });

        if (cached) {
          indexedNotes.push(cached);
        }
      }
    }

    await this.knowledgeIndexRepository.markRequested(cx.identityId, documentRefs, requestedAt);

    await recordExecution(this.executionLogPort, {
      identityId: cx.identityId,
      taskType: 'KNOWLEDGE_INDEX_SYNC',
      status: failedCount > 0 ? 'FAILED' : 'COMPLETED',
      requestId: options?.requestId,
      errorCategory: failedCount > 0 ? 'partial_failure' : undefined,
      input: {
        knowledgeDocumentIds: stableResources.map((resource) => resource.knowledgeDocumentId),
        force: options?.force ?? false,
      },
      result: {
        indexedCount,
        reusedCount,
        failedCount,
      },
      error:
        failedCount > 0 ? `${failedCount} note(s) failed during knowledge indexing` : undefined,
      processingMs: Date.now() - requestedAt,
    });

    return {
      indexedNotes,
      indexedCount,
      reusedCount,
      failedCount,
      results,
    };
  }
}
