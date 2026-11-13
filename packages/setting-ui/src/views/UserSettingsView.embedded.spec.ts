import { defineComponent, h, type Component } from 'vue';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { settingUiHost } from '../setting-ui-host';
import { useSettingsSectionReset } from '../composables/useSettingsSectionReset';
import UserSettingsView from './UserSettingsView.vue';
import enSetting from '@setting-ui-test-host/locales/en-US/setting';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>()),
  useConfirm: confirmMock,
}));

/**
 * Embedded mode contract (Issue #887): the shell dialog owns the surface, so the
 * view must take its section from `initialTab`, ignore the URL and close through
 * an event. Route mode keeps reading/writing `?tab=` exactly as before.
 *
 * Issue #927 shell: one header row carries the breadcrumb, the section restore
 * action and the only close control.
 */
const SettingsNavigationStub = defineComponent({
  name: 'SettingsNavigation',
  props: {
    items: { type: Array as () => { value: string }[], default: () => [] },
    active: { type: String, default: '' },
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () =>
      h('nav', { 'data-active': props.active }, [
        ...props.items.map((item) =>
          h(
            'button',
            {
              type: 'button',
              'data-testid': `settings-tab-${item.value}`,
              onClick: () => emit('select', item.value),
            },
            item.value,
          ),
        ),
      ]);
  },
});

async function mountView(
  path: string,
  props: { initialTab?: string } = {},
  stubs: Record<string, Component> = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: UserSettingsView }],
  });
  await router.push(path);
  await router.isReady();
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  });
  const replace = vi.spyOn(router, 'replace');
  const shellStore = {
    settingsNavigationOpen: true,
    setSettingsNavigationOpen: vi.fn(),
  };
  const storeSpy = vi.spyOn(settingUiHost, 'useAppShellStore').mockReturnValue(shellStore);
  const wrapper = shallowMount(UserSettingsView, {
    props,
    global: {
      plugins: [
        router,
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { common: { close: 'Close' }, setting: enSetting } },
        }),
      ],
      provide: {
        [settingUiHost.DESKTOP_STARTUP_SERVICE_KEY as symbol]: {},
        [settingUiHost.DESKTOP_UPDATE_SERVICE_KEY as symbol]: {},
      },
      stubs: { SettingsNavigation: SettingsNavigationStub, ...stubs },
    },
  });
  await flushPromises();
  return { router, wrapper, replace, storeSpy };
}

describe('UserSettingsView embedded mode', () => {
  it('takes the section from initialTab, ignores route changes and closes by event', async () => {
    const { router, wrapper, replace, storeSpy } = await mountView('/settings?tab=appearance', {
      initialTab: 'updates',
    });

    // initialTab wins over the URL that is still mounted behind the dialog.
    expect(wrapper.get('nav').attributes('data-active')).toBe('updates');

    await router.push('/settings?tab=ai');
    await flushPromises();
    expect(wrapper.get('nav').attributes('data-active')).toBe('updates');

    await wrapper.get('[data-testid="settings-tab-appearance"]').trigger('click');
    expect(wrapper.get('nav').attributes('data-active')).toBe('appearance');
    expect(replace).not.toHaveBeenCalled();
    expect(router.currentRoute.value.query.tab).toBe('ai');

    await wrapper.get('[data-testid="settings-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    // The old footer action is gone; the header X is the only close control.
    expect(wrapper.find('[data-testid="settings-return-to-app"]').exists()).toBe(false);

    wrapper.unmount();
    storeSpy.mockRestore();
  });

  it('never reads or writes ?tab= and only closes by event', async () => {
    const { router, wrapper, replace, storeSpy } = await mountView('/settings?tab=ai');

    // Without initialTab the view falls back to its own default; the URL is inert.
    expect(wrapper.get('nav').attributes('data-active')).toBe('appearance');

    await wrapper.get('[data-testid="settings-tab-repository"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('nav').attributes('data-active')).toBe('repository');
    expect(replace).not.toHaveBeenCalled();
    expect(router.currentRoute.value.query.tab).toBe('ai');

    await wrapper.get('[data-testid="settings-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
    storeSpy.mockRestore();
  });

  it('keeps the breadcrumb on the active section and hides reset without a section action', async () => {
    const { wrapper, storeSpy } = await mountView('/settings', { initialTab: 'repository' });

    expect(wrapper.get('[data-testid="settings-breadcrumb-current"]').text()).toBe(
      'Knowledge Repository',
    );
    // No section is mounted under shallowMount, so nothing registered a restore action.
    expect(wrapper.find('[data-testid="settings-restore-defaults"]').exists()).toBe(false);

    await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="settings-breadcrumb-current"]').text()).toBe(
      'Keyboard shortcuts',
    );

    wrapper.unmount();
    storeSpy.mockRestore();
  });

  it('restores only the active section, and only after the confirmation', async () => {
    const resetAction = vi.fn(async () => undefined);
    // A section that owns a default registers its own mutation with the shell.
    const AppearanceSection = defineComponent({
      name: 'UserPreferenceSettingsSection',
      setup() {
        useSettingsSectionReset('appearance', resetAction);
        return () => h('div', { 'data-testid': 'appearance-section' });
      },
    });
    confirmMock.mockReset();
    const { wrapper, storeSpy } = await mountView(
      '/settings',
      { initialTab: 'appearance' },
      { UserPreferenceSettingsSection: AppearanceSection },
    );

    const restore = wrapper.get('[data-testid="settings-restore-defaults"]');

    // Cancelling the confirmation leaves the section untouched.
    confirmMock.mockResolvedValueOnce(false);
    await restore.trigger('click');
    await flushPromises();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(resetAction).not.toHaveBeenCalled();

    confirmMock.mockResolvedValueOnce(true);
    await restore.trigger('click');
    await flushPromises();
    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(resetAction).toHaveBeenCalledTimes(1);

    // The registered action belongs to the appearance section only.
    await wrapper.get('[data-testid="settings-tab-repository"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="settings-restore-defaults"]').exists()).toBe(false);

    wrapper.unmount();
    storeSpy.mockRestore();
  });
});
