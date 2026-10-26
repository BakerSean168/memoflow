import {
  AIRuntimeUsageQueryClientRequestSchema,
  AIRuntimeUsageSummarySchema,
  type AIRuntimeUsageQueryClientRequest,
  type AIRuntimeUsageSummary,
} from '@memoflow/contracts/ai';
import { AIChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { createResultClientError } from '../infrastructure-client/adapters/result-client-error';

/** Cross-runtime durable usage projection. Identity is always host-injected. */
export interface RuntimeUsageClient {
  get(request: AIRuntimeUsageQueryClientRequest): Promise<AIRuntimeUsageSummary>;
}

function parseRequest(request: AIRuntimeUsageQueryClientRequest): AIRuntimeUsageQueryClientRequest {
  const parsed = AIRuntimeUsageQueryClientRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw createResultClientError('Invalid AI runtime usage request', 'VALIDATION_ERROR');
  }
  return parsed.data;
}

function parseSummary(value: unknown): AIRuntimeUsageSummary {
  const parsed = AIRuntimeUsageSummarySchema.safeParse(value);
  if (!parsed.success) {
    throw createResultClientError('Invalid AI runtime usage response', 'AI_RUNTIME_PROTOCOL_ERROR');
  }
  return parsed.data;
}

export class RuntimeUsageHttpClient implements RuntimeUsageClient {
  constructor(private readonly httpClient: IResultHttpClient) {}

  async get(request: AIRuntimeUsageQueryClientRequest): Promise<AIRuntimeUsageSummary> {
    const result = await this.httpClient.post<unknown>('/ai/runtime/usage', parseRequest(request));
    return parseSummary(unwrapOrThrowError(result));
  }
}

export class RuntimeUsageIpcClient implements RuntimeUsageClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async get(request: AIRuntimeUsageQueryClientRequest): Promise<AIRuntimeUsageSummary> {
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_USAGE_GET,
      parseRequest(request),
    );
    return parseSummary(unwrapOrThrowError(result));
  }
}

export function createRuntimeUsageHttpClient(httpClient: IResultHttpClient): RuntimeUsageClient {
  return new RuntimeUsageHttpClient(httpClient);
}

export function createRuntimeUsageIpcClient(ipcClient: IResultIpcClient): RuntimeUsageClient {
  return new RuntimeUsageIpcClient(ipcClient);
}
