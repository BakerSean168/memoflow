import { defineComponent, h } from 'vue';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { settingUiHost } from '../setting-ui-host';
import UserSettingsView from './UserSettingsView.vue';
import enSetting from '@setting-ui-test-host/locales/en-US/setting';

/**
 * Embedded mode contract (Issue #887): the shell dialog owns the surface, so the
 * view must take its section from `initialTab`, ignore the URL and close through
 * an event. Route mode keeps reading/writing `?tab=` exactly as before.
 */
const SettingsNavigationStub = defineComponent({
  name: 'SettingsNavigation',
  props: {
    items: { type: Array as () => { value: string }[], default: () => [] },
    active: { type: String, default: '' },
  },
  emits: ['select', 'return-to-app'],
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
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'settings-return-to-app',
            onClick: () => emit('return-to-app'),
          },
          'Back',
        ),
      ]);
  },
});

async function mountView(path: string, props: { initialTab?: string } = {}) {
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
          messages: { 'en-US': { setting: enSetting } },
        }),
      ],
      provide: {
        [settingUiHost.DESKTOP_STARTUP_SERVICE_KEY as symbol]: {},
        [settingUiHost.DESKTOP_UPDATE_SERVICE_KEY as symbol]: {},
      },
      stubs: { SettingsNavigation: SettingsNavigationStub },
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

    await wrapper.get('[data-testid="settings-return-to-app"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

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

    await wrapper.get('[data-testid="settings-return-to-app"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
    storeSpy.mockRestore();
  });
});
