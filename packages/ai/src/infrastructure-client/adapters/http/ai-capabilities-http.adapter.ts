import type { AICapabilities } from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/transport-contracts/result';
import type { IAICapabilitiesApiClient, IResultHttpClient } from '../types';

/**
 * HTTP adapter for AI capabilities.
 * Returns Result envelopes — never throws (residual 97).
 */
export class AICapabilitiesHttpAdapter implements IAICapabilitiesApiClient {
  constructor(private readonly httpClient: IResultHttpClient) {}

  async getCapabilities(): Promise<Result<AICapabilities>> {
    return this.httpClient.get<AICapabilities>('/ai/capabilities');
  }
}
