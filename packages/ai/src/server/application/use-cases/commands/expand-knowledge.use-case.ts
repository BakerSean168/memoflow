import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { ExpandKnowledgeReq, ExpandKnowledgeRes } from '@memoflow/contracts/ai';
import { createLogger } from '@memoflow/utils/logger';

import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type {
  KnowledgeExpansionResult,
  IAIExecutionRecordPort,
  IAIProviderSecretVault,
  IKnowledgeQueryPort,
} from '../../ports';
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

const logger = createLogger('ExpandKnowledgeUseCase');

/**
 * 扩展知识内容
 */
export class ExpandKnowledgeUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly knowledgeIndexService: SyncRelevantKnowledgeUseCase,
    private readonly knowledgeQueryPort: IKnowledgeQueryPort,
    private readonly executionRecordPort?: IAIExecutionRecordPort,
    private readonly secretVault?: IAIProviderSecretVault,
  ) {}

  async execute(
    request: ExpandKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<ExpandKnowledgeRes>> {
    const startedAt = Date.now();
    const requestId = cx.requestId;
    let providerMetadata: {
      providerConnectionId?: string;
      modelId?: string;
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
        providerConnectionId: String(provider.id),
        modelId: executionProviderConfig.model,
      };
      const retrievalQuery = [request.instruction, request.currentContent]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join('\n\n');
      const sync = await this.knowledgeIndexService.execute(
        retrievalQuery,
        request.maxResources ?? 8,
        cx,
        {
          requestId,
          providerConfig: executionProviderConfig,
        },
      );

      const result: KnowledgeExpansionResult = await this.knowledgeQueryPort.expand({
        identityId: cx.identityId,
        providerConfig: executionProviderConfig,
        instruction: request.instruction,
        currentContent: request.currentContent,
        indexedNotes: sync.sync.indexedNotes,
        maxCitations: request.maxCitations ?? 4,
        requestId,
      });

      const response: ExpandKnowledgeRes = {
        expandedContent: result.expandedContent,
        citations: result.citations,
        providerId: provider.id,
        tokenUsage: result.usage,
        processingTimeMs: Date.now() - startedAt,
        matchedResourceCount: sync.resources.length,
      };

      await this.recordExecution({
        identityId: cx.identityId,
        operation: 'knowledge.expand',
        outcome: 'succeeded',
        requestId,
        ...providerMetadata,
        tokenUsage: response.tokenUsage,
        latencyMs: response.processingTimeMs,
      });
      return ok(response);
    } catch (err) {
      await this.recordExecution({
        identityId: cx.identityId,
        operation: 'knowledge.expand',
        outcome: 'failed',
        requestId,
        ...providerMetadata,
        errorCategory: classifyAIExecutionError(err),
        safeError: 'Knowledge expansion failed',
        latencyMs: Date.now() - startedAt,
      });
      logger.error('Knowledge expansion failed', {
        error: err,
        identityId: cx.identityId,
        requestId,
      });
      const enriched = attachRequestIdToError(err, requestId);
      return error('INTERNAL_ERROR', enriched.message);
    }
  }

  private async recordExecution(
    input: Parameters<NonNullable<IAIExecutionRecordPort['record']>>[0],
  ): Promise<void> {
    if (!this.executionRecordPort) {
      return;
    }

    try {
      await this.executionRecordPort.record(withAICostEstimate(input));
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
