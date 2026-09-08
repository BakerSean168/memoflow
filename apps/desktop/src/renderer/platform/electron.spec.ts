import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPinia } from '@memoflow/test-utils';
import { RendererEventChannels } from '@memoflow/contracts/electron';
import type { ServerStateInvalidation } from '@memoflow/app-vue';

const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
const bridge = {
  on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
    handlers.set(channel, [...(handlers.get(channel) ?? []), cb]);
  }),
  off: vi.fn(),
  invoke: vi.fn(async () => undefined),
};

const invalidate = vi.fn(async (_intent: ServerStateInvalidation) => undefined);
const runtime = {
  queryClient: {},
  dispatcher: { invalidate },
  dispose: vi.fn(),
  clearIdentity: vi.fn(),
};

vi.mock('./electron-bridge', () => ({
  getElectronBridge: () => bridge,
}));

vi.mock('./server-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./server-state')>();
  return {
    ...actual,
    getDesktopServerStateRuntime: () => runtime,
  };
});

vi.mock('@memoflow/app-vue/modules/account', () => ({
  useAccountStore: () => ({ getCurrentAccountId: 'profile-1', setInitialized: vi.fn() }),
}));

vi.mock('@memoflow/app-vue/modules/goal', () => ({
  useGoalStore: () => ({ setInitialized: vi.fn() }),
}));

vi.mock('@memoflow/app-vue/modules/task', () => ({
  useTaskStore: () => ({ setInitialized: vi.fn() }),
}));

vi.mock('@memoflow/app-vue/modules/schedule', () => ({
  useScheduleStore: () => ({ setInitialized: vi.fn() }),
}));

vi.mock('@memoflow/app-vue/modules/reminder', () => ({
  useReminderStore: () => ({ setInitialized: vi.fn() }),
}));

vi.mock('@memoflow/app-vue/modules/setting', () => ({
  useUserSettingStore: () => ({ setInitialized: vi.fn() }),
}));

function emitDbChanged(tables: string[]): void {
  for (const cb of handlers.get(RendererEventChannels.DB_CHANGED) ?? []) {
    cb({ tables });
  }
}

function dispatchedIntents(): ServerStateInvalidation[] {
  return invalidate.mock.calls.map((call) => call[0] as ServerStateInvalidation);
}

describe('initElectronFeatures DB_CHANGED pilot routing (Step 3)', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    createTestPinia();
    // Desktop renderer tests run under the node environment; electron.ts touches window/DOM.
    vi.stubGlobal('window', { addEventListener: vi.fn(), dispatchEvent: vi.fn() });
    vi.stubGlobal(
      'CustomEvent',
      class CustomEvent {
        detail: unknown;
        constructor(_type: string, init?: { detail?: unknown }) {
          this.detail = init?.detail;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes pilot tables to the dispatcher and keeps non-pilot modules on the legacy path', async () => {
    const { initElectronFeatures } = await import('./electron');
    initElectronFeatures({} as never);

    emitDbChanged(['notifications', 'task_templates', 'rules', 'goals']);

    expect(dispatchedIntents()).toHaveLength(3);
    expect(dispatchedIntents()[0]).toEqual({
      target: 'notification',
      identityScope: 'profile-1',
      source: 'powersync',
    });
    expect(dispatchedIntents()[1]).toEqual({
      target: 'task-template',
      identityScope: 'profile-1',
      source: 'powersync',
      projection: 'all',
    });
    expect(dispatchedIntents()[2]).toEqual({
      target: 'governance',
      identityScope: 'profile-1',
      source: 'powersync',
      projection: 'all',
    });
  }, 60_000);

  it('emits no pilot intents for a non-pilot table batch', async () => {
    const { initElectronFeatures } = await import('./electron');
    initElectronFeatures({} as never);

    emitDbChanged(['schedules']);

    expect(dispatchedIntents()).toHaveLength(0);
  }, 60_000);

  it('ignores DB_CHANGED payloads without tables', async () => {
    const { initElectronFeatures } = await import('./electron');
    initElectronFeatures({} as never);

    for (const cb of handlers.get(RendererEventChannels.DB_CHANGED) ?? []) {
      cb(undefined);
    }

    expect(dispatchedIntents()).toHaveLength(0);
  }, 60_000);
});
