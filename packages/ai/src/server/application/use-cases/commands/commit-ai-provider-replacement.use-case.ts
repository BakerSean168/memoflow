import { error, ok, type Result } from '@memoflow/contracts/result';
import type {
  AIProviderConfigClientDTO,
  AIProviderConfigServerDTO,
  CommitAIProviderReplacementReq,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import { normalizeOpenAICompatibleModelId } from '../../../shared/openai-compatible-normalize';
import type {
  IAIProviderOnboardingCommitPort,
  IAIProviderOnboardingSessionRepository,
} from '../../ports';
import { toClientDTO } from './ai-provider-config-helpers';

export class CommitAIProviderReplacementUseCase {
  constructor(
    private readonly providerRepository: IAIProviderConfigRepository,
    private readonly sessionRepository: IAIProviderOnboardingSessionRepository,
    private readonly commitPort: IAIProviderOnboardingCommitPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    providerId: string,
    request: CommitAIProviderReplacementReq,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    const now = this.now();
    const [current, session] = await Promise.all([
      this.providerRepository.findByIdForIdentity(cx.identityId, providerId),
      this.sessionRepository.findUsable(cx.identityId, request.onboardingId, now),
    ]);
    if (!current) return error('NOT_FOUND', 'AI provider was not found');
    if (!session || session.targetProviderId !== providerId) {
      return error('CONFLICT', 'Provider replacement session expired, was used, or targets another provider');
    }
    if (session.credentialStatus !== 'valid') {
      return error('VALIDATION_ERROR', 'Test a model successfully before replacing this connection');
    }

    const defaultModelId = normalizeOpenAICompatibleModelId(request.defaultModelId);
    const discovered = session.models.some((model) => model.id === defaultModelId);
    const explicitlyVerified = session.verifiedModelIds.includes(defaultModelId);
    if (!discovered && !explicitlyVerified) {
      return error('VALIDATION_ERROR', 'Selected model was not discovered or verified for this provider');
    }

    const replacement: AIProviderConfigServerDTO = {
      ...current,
      baseUrl: session.baseUrl,
      credentialRef: session.credentialRef,
      defaultModel: defaultModelId,
      version: current.version + 1,
      updatedAt: now,
    };

    const outcome = await this.commitPort.replace({
      identityId: cx.identityId,
      onboardingId: request.onboardingId,
      targetProviderId: providerId,
      expectedVersion: current.version,
      previousCredentialRef: current.credentialRef,
      replacement,
      now,
    });
    switch (outcome) {
      case 'REPLACED':
        return ok(toClientDTO(replacement));
      case 'PROVIDER_NOT_FOUND':
        return error('NOT_FOUND', 'AI provider was deleted before replacement could commit');
      case 'SESSION_UNAVAILABLE':
        return error('CONFLICT', 'Provider replacement session was consumed concurrently');
      case 'CONFLICT':
        return error('CONFLICT', 'Provider changed while the replacement was being committed');
    }
  }
}
