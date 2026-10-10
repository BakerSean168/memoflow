import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIProviderSecretVault } from '../../ports';
import type { IAgentInstanceRepository } from '../../agent-instance/agent-instance.repository';

export class DeleteAIProviderUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly secretVault: IAIProviderSecretVault,
    private readonly agentInstances?: IAgentInstanceRepository,
  ) {}

  async execute(identityId: string, id: string): Promise<Result<void>> {
    const provider = await this.providerConfigRepository.findByIdForIdentity(identityId, id);
    if (!provider) {
      return error('NOT_FOUND', 'Provider not found');
    }
    if (await this.agentInstances?.hasConnectionBindings(identityId, id)) {
      return error('CONFLICT', 'Model service is still bound to one or more Agent instances');
    }
    // Revoke first: a failed delete leaves a still-visible connection, but it
    // is already fail-closed. Revocation is idempotent, so a retry is safe.
    await this.secretVault.revoke({ identityId, credentialRef: provider.credentialRef });
    await this.providerConfigRepository.delete(identityId, id);
    return ok(undefined);
  }
}
