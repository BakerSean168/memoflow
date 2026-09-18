import { error, ok, type Result } from '@memoflow/contracts/result';
import {
  type AIProviderConfigClientDTO,
  type AIProviderConfigServerDTO,
  type CommitAIProviderOnboardingReq,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { AiProviderConfigId } from '../../../domain/value-objects/ai-provider-config-id';
import { normalizeOpenAICompatibleModelId } from '../../../shared/openai-compatible-normalize';
import type {
  IAIProviderOnboardingCommitPort,
  IAIProviderOnboardingSessionRepository,
} from '../../ports';
import { toClientDTO } from './ai-provider-config-helpers';

export class CommitAIProviderOnboardingUseCase {
  constructor(
    private readonly sessionRepository: IAIProviderOnboardingSessionRepository,
    private readonly commitPort: IAIProviderOnboardingCommitPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    request: CommitAIProviderOnboardingReq,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    const now = this.now();
    const session = await this.sessionRepository.findUsable(cx.identityId, request.onboardingId, now);
    if (!session) return error('NOT_FOUND', 'Provider onboarding session expired or was already used');
    if (session.targetProviderId !== null) {
      return error('CONFLICT', 'This onboarding handle is bound to an existing Provider replacement');
    }
    if (session.credentialStatus !== 'valid') {
      return error('VALIDATION_ERROR', 'Test a model successfully before saving this provider');
    }

    const defaultModelId = normalizeOpenAICompatibleModelId(request.defaultModelId);
    const discovered = session.models.some((model) => model.id === defaultModelId);
    const explicitlyVerified = session.verifiedModelIds.includes(defaultModelId);
    if (!discovered && !explicitlyVerified) {
      return error('VALIDATION_ERROR', 'Selected model was not discovered or verified for this provider');
    }

    const provider: AIProviderConfigServerDTO = {
      id: AiProviderConfigId.generate(),
      identityId: cx.identityId as AIProviderConfigServerDTO['identityId'],
      name: request.name.trim(),
      providerDefinitionId: session.catalogId,
      baseUrl: session.baseUrl,
      credentialRef: session.credentialRef,
      defaultModel: defaultModelId,
      isActive: true,
      isDefault: request.isDefault ?? false,
      priority: 100,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const outcome = await this.commitPort.commit({
      identityId: cx.identityId,
      onboardingId: request.onboardingId,
      provider,
      now,
    });
    if (outcome === 'SESSION_UNAVAILABLE') {
      return error('CONFLICT', 'Provider onboarding session was consumed concurrently');
    }
    if (outcome === 'CONFLICT') {
      return error('CONFLICT', 'A provider with this name already exists');
    }
    return ok(toClientDTO(provider));
  }
}
