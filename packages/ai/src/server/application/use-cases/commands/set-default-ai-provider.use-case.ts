import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';

export class SetDefaultAIProviderUseCase {
  constructor(private readonly providerConfigRepository: IAIProviderConfigRepository) {}

  async execute(id: string, cx: ExecutionContext): Promise<Result<void>> {
    const outcome = await this.providerConfigRepository.setDefaultForIdentity(cx.identityId, id);
    if (outcome === 'NOT_FOUND') {
      return error('NOT_FOUND', 'Provider not found');
    }
    if (outcome === 'CONFLICT') {
      return error('CONFLICT', 'Another provider became default; refresh and try again');
    }
    return ok(undefined);
  }
}
