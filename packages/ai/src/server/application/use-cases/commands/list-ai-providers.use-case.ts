import type { Result } from '@memoflow/transport-contracts/result';
import { ok } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { AIProviderConfigClientDTO } from '@memoflow/contracts/ai';
import { createLogger } from '@memoflow/utils/logger';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import { toClientDTO } from './ai-provider-config-helpers';

const logger = createLogger('ListAIProvidersUseCase');

export class ListAIProvidersUseCase {
  constructor(private readonly providerConfigRepository: IAIProviderConfigRepository) {}

  async execute(cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO[]>> {
    const providers = await this.providerConfigRepository.findByIdentityId(cx.identityId);
    logger.info('AI providers loaded', {
      identityId: cx.identityId,
      count: providers.length,
      providerIds: providers.map((provider) => String(provider.id)),
    });
    return ok(providers.map((provider) => toClientDTO(provider)));
  }
}
