import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { AIProviderConfigClientDTO } from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import { toClientDTO } from './ai-provider-config-helpers';

export class GetAIProviderUseCase {
  constructor(private readonly providerConfigRepository: IAIProviderConfigRepository) {}

  async execute(identityId: string, id: string): Promise<Result<AIProviderConfigClientDTO>> {
    const provider = await this.providerConfigRepository.findByIdForIdentity(identityId, id);
    if (!provider) {
      return error('NOT_FOUND', 'Provider not found');
    }
    return ok(toClientDTO(provider));
  }
}
