import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { QueryAnalyticsReq, QueryAnalyticsRes } from '@memoflow/contracts/ai';
import { createLogger } from '@memoflow/utils/logger';

import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type {
  IAIExecutionRecordPort,
  IAIProviderSecretVault,
  IAnalyticsQueryPort,
  IAnalyticsReadPort,
} from '../../ports';
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

const logger = createLogger('QueryAIAnalyticsUseCase');

export class QueryAIAnalyticsUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly analyticsReadPort: IAnalyticsReadPort,
    private readonly analyticsQueryPort: IAnalyticsQueryPort,
    private readonly executionRecordPort?: IAIExecutionRecordPort,
    private readonly secretVault?: IAIProviderSecretVault,
  ) {}

  async queryAnalytics(
    request: QueryAnalyticsReq,
    cx: ExecutionContext,
  ): Promise<Result<QueryAnalyticsRes>> {
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
      const context = await this.analyticsReadPort.buildContext(cx.identityId, request.query);
      const result = await this.analyticsQueryPort.query({
        identityId: cx.identityId,
        providerConfig: executionProviderConfig,
        question: request.query,
        context,
        requestId,
      });

      const response: QueryAnalyticsRes = {
        answer: result.answer,
        highlights: result.highlights,
        providerId: provider.id,
        tokenUsage: result.usage,
        processingTimeMs: Date.now() - startedAt,
      };

      await this.recordExecution({
        identityId: cx.identityId,
        operation: 'analytics.query',
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
        operation: 'analytics.query',
        outcome: 'failed',
        requestId,
        ...providerMetadata,
        errorCategory: classifyAIExecutionError(err),
        safeError: 'Analytics query failed',
        latencyMs: Date.now() - startedAt,
      });
      logger.error('Analytics query failed', {
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
      logger.warn('Failed to record analytics execution log', {
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
