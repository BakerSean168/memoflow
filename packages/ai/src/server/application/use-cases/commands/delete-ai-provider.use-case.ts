import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIProviderSecretVault } from '../../ports';

export class DeleteAIProviderUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly secretVault: IAIProviderSecretVault,
  ) {}

  async execute(identityId: string, id: string): Promise<Result<void>> {
    const provider = await this.providerConfigRepository.findByIdForIdentity(identityId, id);
    if (!provider) {
      return error('NOT_FOUND', 'Provider not found');
    }
    // Revoke first: a failed delete leaves a still-visible connection, but it
    // is already fail-closed. Revocation is idempotent, so a retry is safe.
    await this.secretVault.revoke({ identityId, credentialRef: provider.credentialRef });
    await this.providerConfigRepository.delete(identityId, id);
    return ok(undefined);
  }
}
