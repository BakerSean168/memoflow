import { defineComponent, h } from 'vue';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { settingUiHost } from '../setting-ui-host';
import UserSettingsView from '../views/UserSettingsView.vue';
import enSetting from '@setting-ui-test-host/locales/en-US/setting';

describe('desktop startup navigation availability', () => {
  it.each([false, true])(
    'only shows the group when its desktop capability is injected (%s)',
    async (desktop) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/settings', component: UserSettingsView }],
      });
      await router.push('/settings?tab=startup');
      await router.isReady();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      const store = { settingsNavigationOpen: true, setSettingsNavigationOpen: vi.fn() };
      const spy = vi.spyOn(settingUiHost, 'useAppShellStore').mockReturnValue(store);
      const wrapper = shallowMount(UserSettingsView, {
        global: {
          plugins: [
            router,
            createI18n({
              legacy: false,
              locale: 'en-US',
              messages: { 'en-US': { setting: enSetting } },
            }),
          ],
          provide: desktop ? { [settingUiHost.DESKTOP_STARTUP_SERVICE_KEY as symbol]: {} } : {},
          stubs: {
            SettingsNavigation: defineComponent({
              props: ['items', 'active'],
              setup: (props) => () =>
                h(
                  'nav',
                  { 'data-active': props.active },
                  (props.items as { value: string }[]).map((item) =>
                    h('span', { 'data-testid': `settings-tab-${item.value}` }),
                  ),
                ),
            }),
          },
        },
      });
      await flushPromises();
      expect(wrapper.find('[data-testid="settings-tab-startup"]').exists()).toBe(desktop);
      expect(wrapper.find('nav').attributes('data-active')).toBe(
        desktop ? 'startup' : 'appearance',
      );
      wrapper.unmount();
      spy.mockRestore();
    },
  );
});
