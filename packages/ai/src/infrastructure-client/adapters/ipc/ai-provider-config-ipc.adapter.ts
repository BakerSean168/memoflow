import type { IAIProviderConfigApiClient, IResultIpcClient } from '../types';
import { AIChannels } from '@memoflow/contracts/electron';
import type {
  AIProviderConfigClientDTO,
  ListAIProviderConfigsRes,
  SetDefaultAIProviderReq,
  TestAIProviderReq,
  TestAIProviderRes,
  UpdateAIProviderConfigReq,
  ListAIProviderCatalogRes,
  ProbeAIProviderConnectionReq,
  ProbeAIProviderConnectionRes,
  TestAIProviderOnboardingModelReq,
  TestAIProviderOnboardingModelRes,
  CommitAIProviderOnboardingReq,
  ProbeAIProviderReplacementReq,
  CommitAIProviderReplacementReq,
  AIProviderModelCatalogSnapshot,
} from '@memoflow/contracts/ai';
import { map, type Result } from '@memoflow/transport-contracts/result';

/**
 * IPC adapter for AI provider-config ports.
 * Returns Result envelopes — never throws (no unwrap dual-track).
 */
export class AIProviderConfigIpcAdapter implements IAIProviderConfigApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getProviderCatalog(): Promise<Result<ListAIProviderCatalogRes>> {
    return this.ipcClient.invoke<ListAIProviderCatalogRes>(AIChannels.PROVIDER_CATALOG_GET);
  }

  async probeProviderConnection(
    request: ProbeAIProviderConnectionReq,
  ): Promise<Result<ProbeAIProviderConnectionRes>> {
    return this.ipcClient.invoke<ProbeAIProviderConnectionRes>(
      AIChannels.PROVIDER_ONBOARDING_PROBE,
      request,
    );
  }

  async testProviderOnboardingModel(
    request: TestAIProviderOnboardingModelReq,
  ): Promise<Result<TestAIProviderOnboardingModelRes>> {
    return this.ipcClient.invoke<TestAIProviderOnboardingModelRes>(
      AIChannels.PROVIDER_ONBOARDING_TEST_MODEL,
      request,
    );
  }

  async commitProviderOnboarding(
    request: CommitAIProviderOnboardingReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    return this.ipcClient.invoke<AIProviderConfigClientDTO>(
      AIChannels.PROVIDER_ONBOARDING_COMMIT,
      request,
    );
  }

  async probeProviderReplacement(
    id: string,
    request: ProbeAIProviderReplacementReq,
  ): Promise<Result<ProbeAIProviderConnectionRes>> {
    return this.ipcClient.invoke<ProbeAIProviderConnectionRes>(
      AIChannels.PROVIDER_REPLACEMENT_PROBE,
      { providerId: id, request },
    );
  }

  async commitProviderReplacement(
    id: string,
    request: CommitAIProviderReplacementReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    return this.ipcClient.invoke<AIProviderConfigClientDTO>(
      AIChannels.PROVIDER_REPLACEMENT_COMMIT,
      { providerId: id, request },
    );
  }

  async getProviders(): Promise<Result<AIProviderConfigClientDTO[]>> {
    const result = await this.ipcClient.invoke<ListAIProviderConfigsRes>(AIChannels.PROVIDER_LIST);
    return map(result, (envelope) => envelope.data);
  }

  async getProviderById(id: string): Promise<Result<AIProviderConfigClientDTO>> {
    return this.ipcClient.invoke<AIProviderConfigClientDTO>(AIChannels.PROVIDER_GET, id);
  }

  async updateProvider(
    id: string,
    request: UpdateAIProviderConfigReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    return this.ipcClient.invoke<AIProviderConfigClientDTO>(AIChannels.PROVIDER_UPDATE, {
      id,
      ...request,
    });
  }

  async deleteProvider(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke<void>(AIChannels.PROVIDER_DELETE, id);
  }

  async testConnection(request: TestAIProviderReq): Promise<Result<TestAIProviderRes>> {
    return this.ipcClient.invoke<TestAIProviderRes>(AIChannels.PROVIDER_TEST, request);
  }

  async setDefaultProvider(request: SetDefaultAIProviderReq): Promise<Result<void>> {
    return this.ipcClient.invoke<void>(AIChannels.PROVIDER_SET_DEFAULT, request);
  }

  async refreshProviderModels(id: string): Promise<Result<AIProviderModelCatalogSnapshot>> {
    return this.ipcClient.invoke<AIProviderModelCatalogSnapshot>(
      AIChannels.PROVIDER_REFRESH_MODELS,
      id,
    );
  }
}
