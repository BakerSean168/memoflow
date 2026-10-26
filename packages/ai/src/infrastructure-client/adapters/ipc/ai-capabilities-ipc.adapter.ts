import { AIChannels } from '@memoflow/contracts/electron';
import type { AICapabilities } from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/transport-contracts/result';
import type { IAICapabilitiesApiClient, IResultIpcClient } from '../types';

/**
 * IPC adapter for AI capabilities.
 * Returns Result envelopes — never throws (residual 97).
 */
export class AICapabilitiesIpcAdapter implements IAICapabilitiesApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getCapabilities(): Promise<Result<AICapabilities>> {
    return this.ipcClient.invoke<AICapabilities>(AIChannels.CAPABILITIES_GET);
  }
}
