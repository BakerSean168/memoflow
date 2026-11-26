import { defineComponent, h } from 'vue';
import { createI18n } from 'vue-i18n';
import account from '@setting-ui-test-host/locales/en-US/account';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { settingUiHost } from '../setting-ui-host';
import { AUTH_SERVICE_KEY } from '@setting-ui-test-host/di/keys';
import AccountSettingsSection from './AccountSettingsSection.vue';

const AccountProfileStub = defineComponent({
  name: 'AccountProfileSection',
  setup(_, { slots }) {
    return () =>
      h('div', { 'data-testid': 'account-profile-stub' }, [
        slots.password?.(),
        slots.connections?.(),
      ]);
  },
});

const CloudPasswordStub = defineComponent({
  name: 'CloudPasswordSection',
  setup() {
    return () => h('div', { 'data-testid': 'cloud-password-stub' });
  },
});

function mountSection(authService?: object, external = false) {
  return mount(AccountSettingsSection, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': { account } } })],
      provide: {
        ...(authService ? { [AUTH_SERVICE_KEY as symbol]: authService } : {}),
        ...(external ? { [settingUiHost.EXTERNAL_AGENT_SERVICE_KEY as symbol]: {} } : {}),
      },
      stubs: {
        AccountProfileSection: AccountProfileStub,
        CloudPasswordSection: CloudPasswordStub,
        ExternalAgentConnectionsSection: {
          props: { summary: Boolean },
          emits: ['open'],
          setup(_, { expose }) {
            expose({ focus: () => undefined });
          },
          template: `<button v-if="summary" data-testid="account-connections-open" @click="$emit('open', 'tokens')">Apps</button><div v-else data-testid="external-agent-stub" />`,
        },
      },
    },
  });
}

describe('AccountSettingsSection capability gating', () => {
  it('keeps app management off the overview and restores it after returning from the subpage', async () => {
    const wrapper = mountSection({}, true);
    await flushPromises();
    expect(wrapper.find('[data-testid="external-agent-stub"]').exists()).toBe(false);
    await wrapper.get('[data-testid="account-connections-open"]').trigger('click');
    expect(wrapper.find('[data-testid="account-connections-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="external-agent-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="account-profile-stub"]').exists()).toBe(false);
    await wrapper.get('[data-testid="account-connections-back"]').trigger('click');
    expect(wrapper.find('[data-testid="account-connections-page"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="account-profile-stub"]').exists()).toBe(true);
    await flushPromises();
    wrapper.unmount();
  });

  it('renders the account owner section without requiring the cloud password capability', async () => {
    const wrapper = mountSection();
    await flushPromises();

    expect(wrapper.get('[data-testid="account-settings-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-password-stub"]').exists()).toBe(false);
  });

  it('mounts cloud password controls only when the host provides AuthService', async () => {
    const wrapper = mountSection({});
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-password-stub"]').exists()).toBe(true);
  });
});
