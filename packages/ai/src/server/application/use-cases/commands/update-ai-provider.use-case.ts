import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type {
  AIProviderConfigServerDTO,
  UpdateAIProviderConfigReq,
  AIProviderConfigClientDTO,
} from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import { toClientDTO } from './ai-provider-config-helpers';

export class UpdateAIProviderUseCase {
  constructor(private readonly providerConfigRepository: IAIProviderConfigRepository) {}

  async execute(
    identityId: string,
    id: string,
    request: UpdateAIProviderConfigReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    const current = await this.providerConfigRepository.findByIdForIdentity(identityId, id);
    if (!current) {
      return error('NOT_FOUND', 'Provider not found');
    }

    const nextIsActive = request.isActive ?? current.isActive;
    const updated: AIProviderConfigServerDTO = {
      ...current,
      name: request.name?.trim() ?? current.name,
      isDefault: nextIsActive && (request.isDefault ?? current.isDefault),
      isActive: nextIsActive,
      updatedAt: Date.now(),
      version: current.version + 1,
    };

    const outcome = await this.providerConfigRepository.save(updated);
    if (outcome === 'CONFLICT') {
      return error('CONFLICT', 'Another provider became default; refresh and try again');
    }
    return ok(toClientDTO(updated));
  }
}
