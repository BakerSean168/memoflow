import type { IAIProviderConfigApiClient, IResultHttpClient } from '../types';
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
 * HTTP adapter for AI provider-config ports.
 * Returns Result envelopes — never throws (no unwrap dual-track).
 */
export class AIProviderConfigHttpAdapter implements IAIProviderConfigApiClient {
  private readonly aiBaseUrl = '/ai';
  private readonly baseUrl = '/ai/providers';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async getProviderCatalog(): Promise<Result<ListAIProviderCatalogRes>> {
    return this.httpClient.get<ListAIProviderCatalogRes>(`${this.aiBaseUrl}/provider-catalog`);
  }

  async probeProviderConnection(
    request: ProbeAIProviderConnectionReq,
  ): Promise<Result<ProbeAIProviderConnectionRes>> {
    return this.httpClient.post<ProbeAIProviderConnectionRes>(
      `${this.aiBaseUrl}/provider-connections/probe`,
      request,
    );
  }

  async testProviderOnboardingModel(
    request: TestAIProviderOnboardingModelReq,
  ): Promise<Result<TestAIProviderOnboardingModelRes>> {
    return this.httpClient.post<TestAIProviderOnboardingModelRes>(
      `${this.aiBaseUrl}/provider-connections/test-model`,
      request,
    );
  }

  async commitProviderOnboarding(
    request: CommitAIProviderOnboardingReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    return this.httpClient.post<AIProviderConfigClientDTO>(this.baseUrl, request);
  }

  async probeProviderReplacement(
    id: string,
    request: ProbeAIProviderReplacementReq,
  ): Promise<Result<ProbeAIProviderConnectionRes>> {
    return this.httpClient.post<ProbeAIProviderConnectionRes>(
      `${this.baseUrl}/${id}/replacement/probe`,
      request,
    );
  }

  async commitProviderReplacement(
    id: string,
    request: CommitAIProviderReplacementReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    return this.httpClient.post<AIProviderConfigClientDTO>(
      `${this.baseUrl}/${id}/replacement/commit`,
      request,
    );
  }

  async getProviders(): Promise<Result<AIProviderConfigClientDTO[]>> {
    const result = await this.httpClient.get<ListAIProviderConfigsRes>(this.baseUrl);
    return map(result, (envelope) => envelope.data);
  }

  async getProviderById(id: string): Promise<Result<AIProviderConfigClientDTO>> {
    return this.httpClient.get<AIProviderConfigClientDTO>(`${this.baseUrl}/${id}`);
  }

  async updateProvider(
    id: string,
    request: UpdateAIProviderConfigReq,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    return this.httpClient.patch<AIProviderConfigClientDTO>(`${this.baseUrl}/${id}`, request);
  }

  async deleteProvider(id: string): Promise<Result<void>> {
    return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
  }

  async testConnection(request: TestAIProviderReq): Promise<Result<TestAIProviderRes>> {
    return this.httpClient.post<TestAIProviderRes>(`${this.baseUrl}/test`, request);
  }

  async setDefaultProvider(request: SetDefaultAIProviderReq): Promise<Result<void>> {
    return this.httpClient.post<void>(`${this.baseUrl}/${request.providerId}/set-default`);
  }

  async refreshProviderModels(id: string): Promise<Result<AIProviderModelCatalogSnapshot>> {
    return this.httpClient.post<AIProviderModelCatalogSnapshot>(
      `${this.baseUrl}/${id}/refresh-models`,
    );
  }
}
