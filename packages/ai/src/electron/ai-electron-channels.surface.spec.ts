import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import type { AITransportModuleInstance } from '../server/infrastructure';

const mocks = vi.hoisted(() => {
  const channels: string[] = [];
  const handle = vi.fn((channel: string) => {
    if (channels.includes(channel)) throw new Error(`duplicate handler: ${channel}`);
    channels.push(channel);
  });
  const removeHandler = vi.fn((channel: string) => {
    const index = channels.indexOf(channel);
    if (index >= 0) channels.splice(index, 1);
  });
  return { channels, handle, removeHandler };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
}));

import { createAIElectronModule } from './index';

/**
 * Exact AI ipcMain.handle surface owned by the Electron transport module.
 * Order is registration order: `createAIElectronModule` installs these
 * channels in this sequence, and the surface must stay byte-stable.
 */
const AI_ELECTRON_CHANNELS = [
  'ai:runtime:workspace:start',
  'ai:runtime:workspace:ack',
  'ai:runtime:workspace:stop',
  'ai:capabilities:get',
  'ai:provider:catalog:get',
  'ai:provider:onboarding:probe',
  'ai:provider:onboarding:test-model',
  'ai:provider:onboarding:commit',
  'ai:provider:replacement:probe',
  'ai:provider:replacement:commit',
  'ai:provider:list',
  'ai:provider:get',
  'ai:provider:update',
  'ai:provider:delete',
  'ai:provider:test',
  'ai:provider:set-default',
  'ai:provider:refresh-models',
  'ai:chat:conversation:create',
  'ai:chat:conversation:update',
  'ai:chat:conversation:list',
  'ai:chat:conversation:get',
  'ai:chat:conversation:delete',
  'ai:agent-instance',
  'ai:local-agent',
  'ai:runtime:assistant:start',
  'ai:runtime:assistant:answer',
  'ai:runtime:assistant:ask-user-pending',
  'ai:runtime:assistant:approval',
  'ai:runtime:assistant:cancel',
  'ai:runtime:assistant:history',
  'ai:runtime:assistant:delete',
  'ai:runtime:assistant:attention:list',
  'ai:runtime:assistant:attention:ack',
  'ai:runtime:usage:get',
  'ai:runtime:workflow:start',
  'ai:runtime:workflow:resume',
  'ai:runtime:workflow:goal-surface-lease',
  'ai:runtime:workflow:get',
  'ai:runtime:workflow:list',
  'ai:runtime:workflow:cancel',
  'ai:knowledge:query',
  'ai:knowledge:expand',
  'ai:knowledge:reindex',
  'ai:analytics:query',
  'ai:evaluations:overview:get',
] as const;

function createFakeInstance() {
  return {
    start: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  } as unknown as AITransportModuleInstance;
}

function createFakeContext(): IElectronModuleContext {
  return {
    auth: { requireRequestContext: vi.fn() },
  } as unknown as IElectronModuleContext;
}

describe('AI Electron channel surface', () => {
  afterEach(() => {
    mocks.channels.length = 0;
    vi.clearAllMocks();
  });

  it('publishes the exact 45-channel inventory owned by the AI transport module', () => {
    expect(AI_ELECTRON_CHANNELS).toHaveLength(45);
    expect(new Set(AI_ELECTRON_CHANNELS).size).toBe(45);
    for (const channel of AI_ELECTRON_CHANNELS) {
      expect(Object.values(AIChannels)).toContain(channel);
    }
  });

  it('registers every inventoried channel in the same order and no others', async () => {
    const instance = createFakeInstance();
    const moduleDef = createAIElectronModule({ instance });

    await moduleDef.register(createFakeContext());

    expect(mocks.channels).toEqual([...AI_ELECTRON_CHANNELS]);
    for (const channel of AI_ELECTRON_CHANNELS) {
      expect(mocks.handle).toHaveBeenCalledWith(channel, expect.any(Function));
    }
    expect(mocks.channels).not.toContain(AIChannels.LOCAL_AGENT_PANEL_COMMAND);
    expect(mocks.channels).not.toContain(AIChannels.LOCAL_AGENT_PANEL_RESPONSE);

    await moduleDef.destroy?.();
    expect(mocks.channels).toEqual([]);
    expect(mocks.removeHandler).toHaveBeenCalledTimes(AI_ELECTRON_CHANNELS.length);
  });

  it('starts the assembled instance only after all channels are registered', async () => {
    const instance = createFakeInstance();
    const moduleDef = createAIElectronModule({ instance });

    await moduleDef.register(createFakeContext());

    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(mocks.channels).toHaveLength(AI_ELECTRON_CHANNELS.length);
    expect(mocks.handle.mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(instance.start).mock.invocationCallOrder[0]!,
    );
  });
});
