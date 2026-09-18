import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import type { ReindexKnowledgeReq, ReindexKnowledgeRes } from '@memoflow/contracts/ai';
import { createLogger } from '@memoflow/utils/logger';

import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIProviderSecretVault } from '../../ports';
import type { ReindexAllKnowledgeUseCase } from './reindex-all-knowledge.use-case';
import type { SyncNoteByIdUseCase } from './sync-note-by-id.use-case';
import type { SyncKnowledgeNotesResult } from './ai-knowledge-index-helpers';
import { attachRequestIdToError } from './ai-observability';
import {
  resolveActiveProviderConfig,
  resolveProviderCredential,
  toChatExecutionProviderConfig,
} from './ai-provider-resolution';

const logger = createLogger('ReindexKnowledgeUseCase');

/**
 * 重建知识索引
 */
export class ReindexKnowledgeUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly knowledgeIndexService: ReindexAllKnowledgeUseCase,
    private readonly syncNoteById?: SyncNoteByIdUseCase,
    private readonly secretVault?: IAIProviderSecretVault,
  ) {}

  async execute(
    request: ReindexKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<ReindexKnowledgeRes>> {
    const requestId = cx.requestId;

    try {
      let executionProviderConfig;
      try {
        const provider = await resolveActiveProviderConfig(
          this.providerConfigRepository,
          cx.identityId,
        );
        if (!this.secretVault) throw new Error('AI provider SecretVault is unavailable');
        const credential = await resolveProviderCredential(
          this.secretVault,
          cx.identityId,
          provider,
        );
        executionProviderConfig = toChatExecutionProviderConfig(provider, credential, {
          temperature: 0.2,
        });
      } catch (providerError) {
        if (!request.knowledgeDocumentIds) {
          throw providerError;
        }
        executionProviderConfig = undefined;
      }
      const options = {
        force: request.force ?? false,
        requestId,
        providerConfig: executionProviderConfig,
      };
      const sync = request.knowledgeDocumentIds
        ? await this.syncRequestedNotes(request.knowledgeDocumentIds, cx, options)
        : await this.knowledgeIndexService.execute(cx, request.limit ?? 200, options);

      return ok({
        indexedCount: sync.indexedCount,
        reusedCount: sync.reusedCount,
        failedCount: sync.failedCount,
        results: sync.results.map((result) => ({
          ...result,
          knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(result.knowledgeDocumentId),
        })),
      });
    } catch (err) {
      logger.error('Knowledge reindex failed', {
        error: err,
        identityId: cx.identityId,
        requestId,
      });
      const enriched = attachRequestIdToError(err, requestId);
      return error('INTERNAL_ERROR', enriched.message);
    }
  }

  private async syncRequestedNotes(
    knowledgeDocumentIds: string[],
    cx: ExecutionContext,
    options: Parameters<SyncNoteByIdUseCase['execute']>[2],
  ): Promise<SyncKnowledgeNotesResult> {
    if (!this.syncNoteById) {
      throw new Error('Targeted knowledge indexing is unavailable');
    }

    const merged: SyncKnowledgeNotesResult = {
      indexedNotes: [],
      indexedCount: 0,
      reusedCount: 0,
      failedCount: 0,
      results: [],
    };

    for (const knowledgeDocumentId of [...new Set(knowledgeDocumentIds)]) {
      const result = await this.syncNoteById.execute(knowledgeDocumentId, cx, options);
      if (!result.note || !result.sync) {
        merged.failedCount += 1;
        merged.results.push({
          knowledgeDocumentId,
          sourcePath: knowledgeDocumentId,
          status: 'failed',
          error: 'Knowledge note not found',
        });
        continue;
      }

      merged.indexedNotes.push(...result.sync.indexedNotes);
      merged.indexedCount += result.sync.indexedCount;
      merged.reusedCount += result.sync.reusedCount;
      merged.failedCount += result.sync.failedCount;
      merged.results.push(...result.sync.results);
    }

    return merged;
  }
}
