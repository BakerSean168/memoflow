import { ok, type Result } from '@memoflow/contracts/result';
import type {
  TestAIProviderOnboardingModelReq,
  TestAIProviderOnboardingModelRes,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { AIExecutionError } from '../../../../shared/ai-execution-error';
import { normalizeOpenAICompatibleModelId } from '../../../shared/openai-compatible-normalize';
import type {
  IAIChatExecutionPort,
  IAIProviderOnboardingSessionRepository,
  IAIProviderSecretVault,
} from '../../ports';

export class TestAIProviderOnboardingModelUseCase {
  constructor(
    private readonly sessionRepository: IAIProviderOnboardingSessionRepository,
    private readonly chatExecution: IAIChatExecutionPort,
    private readonly secretVault: IAIProviderSecretVault,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    request: TestAIProviderOnboardingModelReq,
    cx: ExecutionContext,
  ): Promise<Result<TestAIProviderOnboardingModelRes>> {
    const startedAt = this.now();
    const session = await this.sessionRepository.findUsable(
      cx.identityId,
      request.onboardingId,
      startedAt,
    );
    if (!session) throw new AIExecutionError('not_found', 'AI provider onboarding session is unavailable');

    const modelId = normalizeOpenAICompatibleModelId(request.modelId);
    const credential = await this.secretVault.resolve({
      identityId: cx.identityId,
      credentialRef: session.credentialRef,
      now: startedAt,
    });
    await this.chatExecution.complete({
      identityId: cx.identityId,
      requestId: cx.requestId,
      providerConfig: {
        provider: 'openai_compatible',
        model: modelId,
        apiKey: credential.value,
        baseUrl: session.baseUrl,
        temperature: 0,
        maxTokens: 16,
      },
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    });
    const verified = await this.sessionRepository.markModelVerified({
      identityId: cx.identityId,
      onboardingId: request.onboardingId,
      modelId,
      now: this.now(),
    });
    if (!verified) throw new AIExecutionError('conflict', 'AI provider onboarding session changed during model test');

    return ok({ ok: true, modelId, latencyMs: Math.max(0, this.now() - startedAt) });
  }
}
