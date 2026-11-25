/** @vitest-environment happy-dom */
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import type { RoutineClientPort } from '@memoflow/routine-client';
import { ROUTINE_SERVICE_KEY } from '@routine-ui-test-host/di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  type ServerStateRuntime,
} from '@routine-ui-test-host/platform/server-state';
import { useRoutineConfiguration } from './useRoutineConfiguration';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': { routine: { toast: { operationFailed: 'Operation failed' } } },
  },
});

const EMPTY_SNAPSHOT = {
  definitions: [],
  profiles: [],
  memberships: [],
  preferences: { globalEnabled: true, version: 0 },
  runtimeContext: { activeProfileIds: [] },
  capabilities: { localRuntime: false },
  overrides: [],
};

function createRoutineService() {
  return {
    getConfigurationSnapshot: vi.fn().mockResolvedValue(ok(EMPTY_SNAPSHOT)),
    updatePreferences: vi.fn().mockResolvedValue(ok({})),
    createRoutine: vi.fn().mockResolvedValue(ok({})),
    updateRoutine: vi.fn().mockResolvedValue(ok({})),
    deleteRoutine: vi.fn().mockResolvedValue(ok({})),
    createProfile: vi.fn().mockResolvedValue(ok({})),
    updateProfile: vi.fn().mockResolvedValue(ok({})),
    deleteProfile: vi.fn().mockResolvedValue(ok({})),
    replaceRoutineProfiles: vi.fn().mockResolvedValue(ok({})),
    setMembershipEnabled: vi.fn().mockResolvedValue(ok({})),
    setProfileActive: vi.fn().mockResolvedValue(ok({})),
    setTemporaryOverride: vi.fn().mockResolvedValue(ok({})),
    clearTemporaryOverride: vi.fn().mockResolvedValue(ok({})),
  };
}

function mountConfiguration(
  service: ReturnType<typeof createRoutineService>,
  runtime: ServerStateRuntime,
) {
  let api!: ReturnType<typeof useRoutineConfiguration>;
  const Host = defineComponent({
    setup() {
      api = useRoutineConfiguration();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, {
    global: {
      plugins: [i18n],
      provide: {
        [ROUTINE_SERVICE_KEY as symbol]: service as unknown as RoutineClientPort,
        [SERVER_STATE_RUNTIME_KEY as symbol]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'identity-1',
      },
    },
  });
  return { wrapper, api };
}

type Mutator = (api: ReturnType<typeof useRoutineConfiguration>) => Promise<void>;

const mutators: ReadonlyArray<readonly [string, Mutator]> = [
  [
    'updatePreferences',
    (api) => api.updatePreferences({ globalEnabled: false, expectedVersion: 1 }),
  ],
  ['createRoutine', (api) => api.createRoutine({ name: 'Wind down' } as never)],
  ['updateRoutine', (api) => api.updateRoutine('routine-1', { expectedVersion: 1 } as never)],
  ['deleteRoutine', (api) => api.deleteRoutine('routine-1')],
  ['createProfile', (api) => api.createProfile({ name: 'Evening' } as never)],
  ['updateProfile', (api) => api.updateProfile('profile-1', { expectedVersion: 1 } as never)],
  ['deleteProfile', (api) => api.deleteProfile('profile-1')],
  [
    'replaceRoutineProfiles',
    (api) => api.replaceRoutineProfiles('routine-1', { profileIds: [] } as never),
  ],
  [
    'setMembershipEnabled',
    (api) =>
      api.setMembershipEnabled('routine-1', 'profile-1', {
        enabled: false,
        expectedVersion: 1,
      } as never),
  ],
  [
    'setProfileActive',
    (api) => api.setProfileActive('profile-1', { active: false, expectedVersion: 1 } as never),
  ],
  ['setTemporaryOverride', (api) => api.setTemporaryOverride('routine-1', {} as never)],
  ['clearTemporaryOverride', (api) => api.clearTemporaryOverride('routine-1')],
];

describe('useRoutineConfiguration owner invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits one identity-scoped routine-upcoming intent for every committed mutation', async () => {
    const runtime = createTestServerStateRuntime();
    const service = createRoutineService();
    const { wrapper, api } = mountConfiguration(service, runtime);
    const events: unknown[] = [];
    runtime.dispatcher.subscribe((event) => events.push(event));

    for (const [name, mutate] of mutators) {
      events.length = 0;
      await mutate(api);
      expect(events, name).toEqual([{ target: 'routine-upcoming', identityScope: 'identity-1' }]);
    }

    wrapper.unmount();
    runtime.dispose();
  });

  it('never invalidates the owner projection when the write fails', async () => {
    const runtime = createTestServerStateRuntime();
    const service = createRoutineService();
    service.updateRoutine.mockResolvedValueOnce({
      ok: false,
      error: { code: 'routine.version_conflict', message: 'stale version' },
    });
    const { wrapper, api } = mountConfiguration(service, runtime);
    const events: unknown[] = [];
    runtime.dispatcher.subscribe((event) => events.push(event));

    await expect(
      api.updateRoutine('routine-1', { expectedVersion: 1 } as never),
    ).rejects.toBeTruthy();
    expect(events).toEqual([]);

    wrapper.unmount();
    runtime.dispose();
  });
});
