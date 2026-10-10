import { describe, expect, it, vi } from 'vitest';
import { createAIModuleForTests } from '../../../testing/ai-test-support';
import type { MastraAIRuntime } from '../../mastra/runtime';
import type { AIModuleRuntimeContribution } from '../ai.module';

function fakeMastraRuntime(
  overrides: {
    init?: () => Promise<void>;
    dispose?: () => Promise<void>;
  } = {},
) {
  const init = vi.fn(overrides.init ?? (async () => {}));
  const dispose = vi.fn(overrides.dispose ?? (async () => {}));
  return {
    init,
    dispose,
    runtime: { init, dispose } as unknown as MastraAIRuntime,
  };
}

describe('createAIModule Mastra lifecycle', () => {
  it('starts shared services without initializing the optional built-in runtime and still owns disposal', async () => {
    const calls: string[] = [];
    const contribution: AIModuleRuntimeContribution = {
      start: vi.fn(() => calls.push('contribution:start')),
      stop: vi.fn(() => calls.push('contribution:stop')),
    };
    const mastra = fakeMastraRuntime({
      init: async () => {
        calls.push('mastra:init');
      },
      dispose: async () => {
        calls.push('mastra:dispose');
      },
    });
    const instance = createAIModuleForTests({
      runtimeContributions: contribution,
      mastraRuntime: mastra.runtime,
    });

    await instance.start();
    expect(calls).toEqual(['contribution:start']);
    expect(instance.mastraRuntime).toBe(mastra.runtime);

    await instance.dispose();
    expect(calls).toEqual(['contribution:start', 'contribution:stop', 'mastra:dispose']);
    expect(mastra.init).not.toHaveBeenCalled();
    expect(mastra.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps provider setup available when built-in initialization would fail', async () => {
    const originalError = new Error('mastra init failed');
    const contribution: AIModuleRuntimeContribution = {
      start: vi.fn(() => {}),
      stop: vi.fn(() => {}),
    };
    const mastra = fakeMastraRuntime({
      init: async () => {
        throw originalError;
      },
    });
    const instance = createAIModuleForTests({
      runtimeContributions: contribution,
      mastraRuntime: mastra.runtime,
    });

    await instance.start();
    expect((await instance.providerManagement.getProviderCatalog()).ok).toBe(true);
    expect(contribution.start).toHaveBeenCalledTimes(1);
    expect(contribution.stop).not.toHaveBeenCalled();
    expect(mastra.init).not.toHaveBeenCalled();
    expect(mastra.dispose).not.toHaveBeenCalled();

    await instance.dispose();
    expect(contribution.stop).toHaveBeenCalledTimes(1);
    expect(mastra.dispose).toHaveBeenCalledTimes(1);
  });
});
