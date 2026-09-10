import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { AUTH_SERVICE_KEY } from '../../../di/keys';
import AccountSettingsSection from './AccountSettingsSection.vue';

const AccountProfileStub = defineComponent({
  name: 'AccountProfileSection',
  setup() {
    return () => h('div', { 'data-testid': 'account-profile-stub' });
  },
});

const CloudPasswordStub = defineComponent({
  name: 'CloudPasswordSection',
  setup() {
    return () => h('div', { 'data-testid': 'cloud-password-stub' });
  },
});

function mountSection(authService?: object) {
  return mount(AccountSettingsSection, {
    global: {
      provide: authService ? { [AUTH_SERVICE_KEY as symbol]: authService } : {},
      stubs: {
        AccountProfileSection: AccountProfileStub,
        CloudPasswordSection: CloudPasswordStub,
      },
    },
  });
}

describe('AccountSettingsSection capability gating', () => {
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
