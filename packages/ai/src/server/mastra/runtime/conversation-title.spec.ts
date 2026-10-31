import { Agent } from '@mastra/core/agent';
import { afterEach, expect, it, vi } from 'vitest';
import { MastraAIRuntime } from './mastra-ai.runtime';

afterEach(() => vi.restoreAllMocks());
it('generates with the exact selected model, no tools or memory, and bounded output/steps', async () => {
  const resolve = vi.fn(async () => ({ model: 'openai/test-model' }));
  const generate = vi
    .spyOn(Agent.prototype, 'generate')
    .mockResolvedValue({ text: '学习计划' } as never);
  const input = {
    content: '帮我制定学习计划',
    automatic: true,
    providerId: 'provider',
    modelId: 'model',
    agentInstanceId: 'agent',
  };
  const result = await MastraAIRuntime.prototype.generateConversationTitle.call(
    { deps: { modelResolver: { resolve } } } as never,
    'owner',
    input,
  );
  expect(result).toBe('学习计划');
  expect(resolve).toHaveBeenCalledWith({
    identityId: 'owner',
    providerId: 'provider',
    modelId: 'model',
    agentInstanceId: 'agent',
  });
  expect(generate).toHaveBeenCalledWith(input.content, {
    abortSignal: expect.any(AbortSignal),
    maxSteps: 1,
    modelSettings: { maxOutputTokens: 80 },
  });
  const worker = generate.mock.contexts[0];
  expect(await worker.listTools()).toEqual({});
  expect(await worker.getMemory()).toBeUndefined();
});
