import { describe, expect, it, vi } from 'vitest';
import { AIChannels } from '@memoflow/desktop-contracts';
import { ok } from '@memoflow/transport-contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import { RuntimeUsageHttpClient, RuntimeUsageIpcClient } from './runtime-usage';

function httpStub(overrides: Partial<IResultHttpClient> = {}): IResultHttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

const summary = {
  executionCount: 2,
  promptTokens: 1200,
  completionTokens: 300,
  totalTokens: 1500,
  estimatedCost: 0.00045,
};

describe('RuntimeUsageClient', () => {
  it('queries conversation usage over HTTP without allowing client identity injection', async () => {
    const post = vi.fn().mockResolvedValue(ok(summary));
    const client = new RuntimeUsageHttpClient(httpStub({ post }));
    await expect(client.get({ conversationId: 'conversation-1' })).resolves.toEqual(summary);
    expect(post).toHaveBeenCalledWith('/ai/runtime/usage', {
      conversationId: 'conversation-1',
    });
    await expect(
      client.get({
        conversationId: 'conversation-1',
        identityId: 'attacker',
      } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('queries run usage over IPC and validates the response protocol', async () => {
    const invoke = vi.fn().mockResolvedValue(ok(summary));
    const client = new RuntimeUsageIpcClient({ invoke } as never);
    await expect(client.get({ runId: 'run-1' })).resolves.toEqual(summary);
    expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_USAGE_GET, {
      runId: 'run-1',
    });

    const malformed = new RuntimeUsageIpcClient({
      invoke: vi.fn().mockResolvedValue(ok({ totalTokens: -1 })),
    } as never);
    await expect(malformed.get({ runId: 'run-1' })).rejects.toMatchObject({
      code: 'AI_RUNTIME_PROTOCOL_ERROR',
    });
  });

  it('requires at least a conversationId or runId', async () => {
    const client = new RuntimeUsageHttpClient(httpStub());
    await expect(client.get({} as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
