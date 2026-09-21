import { flushPromises, shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { RoutineClientPort } from '@memoflow/reminder/client';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
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

const ModuleHeaderStub = defineComponent({
  name: 'ModuleHeader',
  setup(_, { slots }) {
    return () =>
      h('header', { 'data-testid': 'routine-page-toolbar' }, [
        slots.leading?.(),
        slots.actions?.(),
        slots.subnav?.(),
      ]);
  },
});

describe('RoutineConfigurationView', () => {
  it('loads the canonical owner snapshot and renders Routine configuration plus the method library', async () => {
    const client = createRoutineClient();
    const wrapper = shallowMount(RoutineConfigurationView, {
      global: {
        plugins: [i18n],
        provide: {
          [ROUTINE_SERVICE_KEY as symbol]: client,
        },
        stubs: {
          ModuleHeader: ModuleHeaderStub,
        },
      },
    });

    await flushPromises();

    expect(client.getConfigurationSnapshot).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="routine-configuration-center"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="routine-card-routine-1"]').text()).toContain('Stand & Move');
    expect(wrapper.find('[data-testid="routine-card-routine-1"]').text()).toContain('Work');
    expect(wrapper.find('[data-testid="routine-method-library"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('20-20-20');
    expect(wrapper.text()).toContain('Pomodoro');
  });

  it('keeps the canonical /routines surface free of retired Reminder model vocabulary', async () => {
    const client = createRoutineClient();
    const wrapper = shallowMount(RoutineConfigurationView, {
      global: {
        plugins: [i18n],
        provide: {
          [ROUTINE_SERVICE_KEY as symbol]: client,
        },
        stubs: {
          ModuleHeader: ModuleHeaderStub,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).not.toContain('ReminderTemplate');
    expect(wrapper.text()).not.toContain('ReminderGroup');
    expect(wrapper.text()).not.toContain('ReminderInstance');
    expect(wrapper.text()).not.toContain('ReminderResponse');
  });
});
