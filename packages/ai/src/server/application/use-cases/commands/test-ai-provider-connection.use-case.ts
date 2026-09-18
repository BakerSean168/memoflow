import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  TestAIProviderReq,
  TestAIProviderRes,
} from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIChatExecutionPort, IAIProviderSecretVault } from '../../ports';
import { resolveProviderConfigForConnectionTest } from './ai-provider-config-helpers';

export class TestAIProviderConnectionUseCase {
  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly chatExecutionPort: IAIChatExecutionPort,
    private readonly secretVault: IAIProviderSecretVault,
  ) {}

  async execute(
    request: TestAIProviderReq,
    cx: ExecutionContext,
  ): Promise<Result<TestAIProviderRes>> {
    const startedAt = Date.now();

    try {
      const providerConfig = await resolveProviderConfigForConnectionTest(
        this.providerConfigRepository,
        this.secretVault,
        cx.identityId,
        request,
      );
      const result = await this.chatExecutionPort.complete({
        identityId: cx.identityId,
        providerConfig,
        messages: [{ role: 'user', content: request.testPrompt ?? 'Hello, this is a test.' }],
      });

      return ok({
        ok: true,
        response: result.content,
        model: providerConfig.model,
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      return ok({
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown provider error',
        latencyMs: Date.now() - startedAt,
      });
    }
  }
}
