import type {
  ProbeAIProviderReplacementReq,
  ProbeAIProviderConnectionRes,
} from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { AIExecutionError } from '../../../../shared/ai-execution-error';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import { ProbeAIProviderConnectionUseCase } from './probe-ai-provider-connection.use-case';

export class ProbeAIProviderReplacementUseCase {
  constructor(
    private readonly providerRepository: IAIProviderConfigRepository,
    private readonly probeConnection: ProbeAIProviderConnectionUseCase,
  ) {}

  async execute(
    providerId: string,
    request: ProbeAIProviderReplacementReq,
    cx: ExecutionContext,
  ): Promise<ProbeAIProviderConnectionRes> {
    const current = await this.providerRepository.findByIdForIdentity(cx.identityId, providerId);
    if (!current) throw new AIExecutionError('not_found', 'AI provider was not found');

    return this.probeConnection.execute(
      {
        ...request,
        // Custom replacement defaults to the current endpoint when the user is
        // rotating only the credential. Preset endpoints stay catalog-owned.
        baseUrl:
          request.catalogId === 'custom' && !request.baseUrl ? current.baseUrl : request.baseUrl,
      },
      cx,
      { targetProviderId: providerId },
    );
  }
}
