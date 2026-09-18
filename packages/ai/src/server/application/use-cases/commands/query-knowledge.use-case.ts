import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { QueryKnowledgeReq, QueryKnowledgeRes } from '@memoflow/contracts/ai';
import { createLogger } from '@memoflow/utils/logger';

import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIExecutionLogPort, IAIProviderSecretVault, IKnowledgeQueryPort } from '../../ports';
import type { SyncRelevantKnowledgeUseCase } from './sync-relevant-knowledge.use-case';
import {
  attachRequestIdToError,
  classifyAIExecutionError,
  withAICostEstimate,
} from './ai-observability';
import {
  resolveActiveProviderConfig,
  resolveProviderCredential,
  toChatExecutionProviderConfig,
} from './ai-provider-resolution';

const logger = createLogger('QueryKnowledgeUseCase');

/**
 * 查询知识库
 */
export class QueryKnowledgeUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly knowledgeIndexService: SyncRelevantKnowledgeUseCase,
    private readonly knowledgeQueryPort: IKnowledgeQueryPort,
    private readonly executionLogPort?: IAIExecutionLogPort,
    private readonly secretVault?: IAIProviderSecretVault,
  ) {}

  async execute(
    request: QueryKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<QueryKnowledgeRes>> {
    const startedAt = Date.now();
    const requestId = cx.requestId;
    let providerMetadata: {
      providerId?: string;
      providerName?: string;
      model?: string;
    } = {};

    try {
      const provider = await resolveActiveProviderConfig(
        this.providerConfigRepository,
        cx.identityId,
        request.providerId,
      );
      const credential = await resolveProviderCredential(this.requireSecretVault(), cx.identityId, provider);
      const executionProviderConfig = toChatExecutionProviderConfig(provider, credential, {
        temperature: 0.2,
      });
      providerMetadata = {
        providerId: provider.id,
        providerName: provider.name,
        model: executionProviderConfig.model,
      };
      const sync = await this.knowledgeIndexService.execute(
        request.query,
        request.maxResources ?? 8,
        cx,
        {
          requestId,
          providerConfig: executionProviderConfig,
        },
      );

      if (sync.resources.length === 0 || sync.sync.indexedNotes.length === 0) {
        const emptyResult: QueryKnowledgeRes = {
          answer: 'No relevant knowledge notes were found for this question.',
          citations: [],
          providerId: provider.id,
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          processingTimeMs: Date.now() - startedAt,
          matchedResourceCount: 0,
        };

        await this.recordExecution({
          identityId: cx.identityId,
          taskType: 'KNOWLEDGE_QUERY',
          status: 'COMPLETED',
          requestId,
          ...providerMetadata,
          input: {
            query: request.query,
            selectedProviderId: request.providerId,
            maxResources: request.maxResources,
          },
          result: {
            matchedResourceCount: emptyResult.matchedResourceCount,
            citationCount: emptyResult.citations.length,
            answer: emptyResult.answer,
          },
          tokenUsage: emptyResult.tokenUsage,
          processingMs: emptyResult.processingTimeMs,
        });
        return ok(emptyResult);
      }

      const result = await this.knowledgeQueryPort.query({
        identityId: cx.identityId,
        providerConfig: executionProviderConfig,
        question: request.query,
        indexedNotes: sync.sync.indexedNotes,
        maxCitations: 3,
        requestId,
      });

      const response: QueryKnowledgeRes = {
        answer: result.answer,
        citations: result.citations,
        providerId: provider.id,
        tokenUsage: result.usage,
        processingTimeMs: Date.now() - startedAt,
        matchedResourceCount: sync.resources.length,
      };

      await this.recordExecution({
        identityId: cx.identityId,
        taskType: 'KNOWLEDGE_QUERY',
        status: 'COMPLETED',
        requestId,
        ...providerMetadata,
        input: {
          query: request.query,
          selectedProviderId: request.providerId,
          maxResources: request.maxResources,
        },
        result: {
          matchedResourceCount: response.matchedResourceCount,
          citationCount: response.citations.length,
          answer: response.answer,
        },
        tokenUsage: response.tokenUsage,
        processingMs: response.processingTimeMs,
      });
      return ok(response);
    } catch (err) {
      await this.recordExecution({
        identityId: cx.identityId,
        taskType: 'KNOWLEDGE_QUERY',
        status: 'FAILED',
        requestId,
        ...providerMetadata,
        errorCategory: classifyAIExecutionError(err),
        input: {
          query: request.query,
          selectedProviderId: request.providerId,
          maxResources: request.maxResources,
        },
        error: err instanceof Error ? err.message : 'Knowledge query failed',
        processingMs: Date.now() - startedAt,
      });
      logger.error('Knowledge query failed', {
        error: err,
        identityId: cx.identityId,
        requestId,
      });
      const enriched = attachRequestIdToError(err, requestId);
      return error('INTERNAL_ERROR', enriched.message);
    }
  }

  private async recordExecution(
    input: Parameters<NonNullable<IAIExecutionLogPort['record']>>[0],
  ): Promise<void> {
    if (!this.executionLogPort) {
      return;
    }

    try {
      await this.executionLogPort.record(withAICostEstimate(input));
    } catch (err) {
      logger.warn('Failed to record knowledge query execution log', {
        error: err,
        identityId: input.identityId,
      });
    }
  }

  private requireSecretVault(): IAIProviderSecretVault {
    if (!this.secretVault) throw new Error('AI provider SecretVault is unavailable');
    return this.secretVault;
  }
}
