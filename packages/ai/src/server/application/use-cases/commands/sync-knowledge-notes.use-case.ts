import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  IAIExecutionRecordPort,
  IKnowledgeIndexRepository,
  IKnowledgeIndexStatusPort,
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
    private readonly executionRecordPort?: IAIExecutionRecordPort,
    private readonly knowledgeIndexStatusPort?: IKnowledgeIndexStatusPort,
  ) {}

  async execute(
    resources: KnowledgeSourceNote[],
    cx: ExecutionContext,
    options?: SyncKnowledgeNotesOptions,
  ): Promise<SyncKnowledgeNotesResult> {
    if (resources.length === 0) {
      return {
        indexedNotes: [],
        indexedCount: 0,
        reusedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const requestedAt = Date.now();
    const cachedResources = await this.knowledgeIndexRepository.findByNoteIds(
      cx.identityId,
      resources.map((resource) => resource.resourceId),
    );
    const cachedByResourceId = new Map(
      cachedResources.map((resource) => [resource.resourceId, resource] as const),
    );

    const indexedNotes: KnowledgeIndexedNote[] = [];
    const results: SyncKnowledgeNotesResult['results'] = [];
    let indexedCount = 0;
    let reusedCount = 0;
    let failedCount = 0;

    for (const resource of resources) {
      const cached = cachedByResourceId.get(resource.resourceId);
      const sourceContentHash = resolveSourceContentHash(resource);
      const canReuse = !options?.force && cached && cached.contentHash === sourceContentHash;

      if (canReuse && cached) {
        indexedNotes.push(cached);
        results.push({
          resourceId: resource.resourceId,
          resourcePath: resource.resourcePath,
          status: 'reused',
        });
        reusedCount += 1;
        await this.reportIndexStatus(cx.identityId, resource, sourceContentHash, 'indexed');
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
          resourceId: resource.resourceId,
          resourcePath: resource.resourcePath,
          status: 'indexed',
        });
        indexedCount += 1;
        await this.reportIndexStatus(cx.identityId, resource, sourceContentHash, 'indexed');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to index knowledge note';
        failedCount += 1;
        results.push({
          resourceId: resource.resourceId,
          resourcePath: resource.resourcePath,
          status: 'failed',
          error: message,
        });
        logger.error('Knowledge indexing failed', {
          error,
          identityId: cx.identityId,
          resourceId: resource.resourceId,
          resourcePath: resource.resourcePath,
        });

        await this.knowledgeIndexRepository.markFailed({
          identityId: cx.identityId,
          repositoryId: resource.repositoryId,
          resourceId: resource.resourceId,
          resourcePath: resource.resourcePath,
          title: resource.title,
          mimeType: resource.mimeType,
          contentHash: sourceContentHash,
          metadata: resource.metadata ?? {},
          error: message,
        });
        await this.reportIndexStatus(cx.identityId, resource, sourceContentHash, 'failed');

        if (cached) {
          indexedNotes.push(cached);
        }
      }
    }

    await this.knowledgeIndexRepository.markRequested(
      cx.identityId,
      resources.map((resource) => resource.resourceId),
      requestedAt,
    );

    await recordExecution(this.executionRecordPort, {
      identityId: cx.identityId,
      operation: 'knowledge.index.sync',
      outcome: failedCount > 0 ? 'failed' : 'succeeded',
      ...(options?.requestId ? { requestId: options.requestId } : {}),
      ...(failedCount > 0
        ? { errorCategory: 'partial_failure', safeError: 'Knowledge indexing partially failed' }
        : {}),
      latencyMs: Date.now() - requestedAt,
    });

    return {
      indexedNotes,
      indexedCount,
      reusedCount,
      failedCount,
      results,
    };
  }

  private async reportIndexStatus(
    identityId: string,
    resource: KnowledgeSourceNote,
    contentHash: string,
    status: 'indexed' | 'failed',
  ): Promise<void> {
    if (!this.knowledgeIndexStatusPort) return;
    try {
      await this.knowledgeIndexStatusPort.updateIndexStatus(identityId, {
        repositoryId: resource.repositoryId,
        resourceId: resource.resourceId,
        contentHash,
        status,
      });
    } catch (error) {
      logger.warn('Failed to report knowledge index status to source projection', {
        error,
        identityId,
        resourceId: resource.resourceId,
        status,
      });
    }
  }
}
