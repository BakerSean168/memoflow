import { flushPromises, shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import type { RoutineClientPort } from '@memoflow/reminder/client';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
import { ResponsiveSegmentedFilter } from '../../../shared/components';
import { productionLocaleMessages } from '../../../locales/production-messages';
import RoutineConfigurationView from './RoutineConfigurationView.vue';

const snapshot = {
  definitions: [
    {
      id: 'routine-1',
      name: 'Stand & Move',
      description: 'Move after focused work.',
      enabled: true,
      trigger: null,
      version: 1,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    },
  ],
  profiles: [
    {
      id: 'profile-1',
      name: 'Work',
      description: null,
      enabled: true,
      active: true,
      version: 1,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    },
  ],
  preferences: { globalEnabled: true, version: 0 },
  memberships: [
    {
      routineId: 'routine-1',
      profileId: 'profile-1',
      enabled: true,
      version: 1,
    },
  ],
  runtimeContext: { activeProfileIds: ['profile-1'] },
  capabilities: { localRuntime: true },
  overrides: [],
} as const;

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function createRoutineClient(): RoutineClientPort {
  return {
    getConfigurationSnapshot: vi.fn().mockResolvedValue(ok(snapshot)),
    updatePreferences: vi.fn().mockResolvedValue(ok({ globalEnabled: false, version: 1 })),
    createRoutine: vi.fn().mockResolvedValue(ok({ id: 'routine-new', version: 1 })),
    updateRoutine: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
    deleteRoutine: vi.fn().mockResolvedValue(ok({ id: 'routine-1' })),
    createProfile: vi.fn().mockResolvedValue(ok({ id: 'profile-new', version: 1 })),
    updateProfile: vi.fn().mockResolvedValue(ok({ id: 'profile-1', version: 2 })),
    deleteProfile: vi.fn().mockResolvedValue(ok({ id: 'profile-1' })),
    replaceRoutineProfiles: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
    setMembershipEnabled: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
    setProfileActive: vi.fn().mockResolvedValue(ok({ id: 'profile-1', version: 2 })),
    setTemporaryOverride: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
    clearTemporaryOverride: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
  };
}

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

async function mountRoutineView(client: RoutineClientPort, initialPath = '/routines') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/routines', component: { template: '<div />' } }],
  });
  await router.push(initialPath);
  await router.isReady();

  const wrapper = shallowMount(RoutineConfigurationView, {
    global: {
      plugins: [i18n, router],
      provide: {
        [ROUTINE_SERVICE_KEY as symbol]: client,
      },
    },
  });
  return { wrapper, router };
}

describe('RoutineConfigurationView', () => {
  it('loads the canonical owner snapshot and renders the compact Routine list without dashboard cards or an inline method library', async () => {
    const client = createRoutineClient();
    const { wrapper } = await mountRoutineView(client);

    await flushPromises();

    expect(client.getConfigurationSnapshot).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="routine-configuration-center"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="routine-card-routine-1"]').text()).toContain('Stand & Move');
    expect(wrapper.find('[data-testid="routine-card-routine-1"]').text()).toContain('Work');
    expect(wrapper.findAll('[data-testid="routine-list-toolbar"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="routine-page-toolbar"]').exists()).toBe(false);
    const stateFilter = wrapper.findComponent(ResponsiveSegmentedFilter);
    expect(stateFilter.exists()).toBe(true);
    expect(stateFilter.props('modelValue')).toBe('all');
    expect(stateFilter.props('options')).toHaveLength(3);
    expect(wrapper.find('[data-testid="routine-global-enabled-control"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="routine-method-library"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Routine overview"]').exists()).toBe(false);
  });

  it('marks local-runtime timing as Desktop-required when the current host cannot execute it', async () => {
    const client = createRoutineClient();
    vi.mocked(client.getConfigurationSnapshot).mockResolvedValue(
      ok({
        ...snapshot,
        definitions: [
          {
            ...snapshot.definitions[0],
            trigger: {
              type: 'Elapsed',
              timingOwner: 'local-runtime',
              durationMs: 50 * 60_000,
              anchor: 'profile-activation',
            },
          },
        ],
        capabilities: { localRuntime: false },
      } as never),
    );
    const { wrapper } = await mountRoutineView(client);

    await flushPromises();

    expect(wrapper.find('[data-testid="routine-desktop-runtime-badge"]').exists()).toBe(true);
  });

  it('does not mark scheduler-owned Elapsed timing as Desktop-required on Web', async () => {
    const client = createRoutineClient();
    vi.mocked(client.getConfigurationSnapshot).mockResolvedValue(
      ok({
        ...snapshot,
        definitions: [
          {
            ...snapshot.definitions[0],
            trigger: {
              type: 'Elapsed',
              timingOwner: 'scheduler',
              durationMs: 50 * 60_000,
              anchor: 'last-satisfied',
            },
          },
        ],
        capabilities: { localRuntime: false },
      } as never),
    );
    const { wrapper } = await mountRoutineView(client);

    await flushPromises();

    expect(wrapper.find('[data-testid="routine-desktop-runtime-badge"]').exists()).toBe(false);
  });

  it('keeps the canonical /routines surface free of retired Reminder model vocabulary', async () => {
    const client = createRoutineClient();
    const { wrapper } = await mountRoutineView(client);

    await flushPromises();

    expect(wrapper.text()).not.toContain('ReminderTemplate');
    expect(wrapper.text()).not.toContain('ReminderGroup');
    expect(wrapper.text()).not.toContain('ReminderInstance');
    expect(wrapper.text()).not.toContain('ReminderResponse');
  });

  it('opens the owner Routine editor from the capsule deep-link query', async () => {
    const client = createRoutineClient();
    const { wrapper, router } = await mountRoutineView(client, '/routines?routine=routine-1');

    await flushPromises();

    const editor = wrapper.findComponent({ name: 'RoutineEditorDialog' });
    expect(editor.exists()).toBe(true);
    expect(editor.props('open')).toBe(true);
    expect(editor.props('routine')).toMatchObject({ id: 'routine-1', name: 'Stand & Move' });

    editor.vm.$emit('update:open', false);
    await flushPromises();

    expect(router.currentRoute.value.query.routine).toBeUndefined();
  });
});
