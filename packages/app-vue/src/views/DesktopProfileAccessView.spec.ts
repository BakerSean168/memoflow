import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { ok } from '@memoflow/contracts/result';
import { ProfileAccessChannels, WindowChannels } from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY } from '../di/keys';
import DesktopProfileAccessView from './DesktopProfileAccessView.vue';

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { operationFailed: 'Operation failed' },
      auth: {
        profileAccess: {
          title: 'Open MemoFlow',
          description: 'Choose a local Profile',
          guest: 'Guest',
          registered: 'Registered',
          open: 'Open',
          unlock: 'Unlock',
          pinRequired: 'PIN required',
          pinPlaceholder: 'Local PIN',
          remove: 'Remove',
          removeConfirm: 'Remove {name}?',
          removed: 'Removed',
        },
      },
    },
  },
});

function mountView(hasPin = false) {
  const profile = {
    profileId: 'profile-1',
    profileKind: 'guest',
    displayName: '访客 4827',
    avatarSeed: 'seed',
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: 1,
    hasPin,
  };
  const profiles = [profile];
  const invoke = vi.fn(async (channel: string) => {
    if (channel === ProfileAccessChannels.CREATE_GUEST) {
      const created = { ...profile, profileId: 'profile-2', displayName: 'Work' };
      profiles.push(created);
      return ok(created);
    }
    if (channel === ProfileAccessChannels.LIST) return ok(profiles);
    if (channel === ProfileAccessChannels.GET_SNAPSHOT) {
      return ok({
        profile: null,
        unlockState: 'LOCKED',
        cloudState: 'UNBOUND',
        capabilities: { local: false, sync: false, cloudAi: false, repositoryConnection: false },
      });
    }
    return ok(undefined);
  });
  const wrapper = mount(DesktopProfileAccessView, {
    global: {
      plugins: [i18n],
      provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
    },
  });
  return { wrapper, invoke };
}

describe('DesktopProfileAccessView', () => {
  it('creates and opens an independent guest', async () => {
    const { wrapper, invoke } = mountView();
    await flushPromises();
    await wrapper.get('[data-testid="desktop-profile-create"] input').setValue('Work');
    await wrapper.get('[data-testid="desktop-profile-create"]').trigger('submit');
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.CREATE_GUEST, {
      requestId: expect.any(String),
      displayName: 'Work',
    });
    expect(wrapper.get('[data-testid="desktop-profile-open-profile-2"]').text()).toContain('Work');
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, { profileId: 'profile-2' });
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
    wrapper.unmount();
  });

  it('renames a local container from the management page', async () => {
    const { wrapper, invoke } = mountView();
    await flushPromises();
    await wrapper.get('[data-testid="desktop-profile-rename-profile-1"]').trigger('click');
    const nameInput = wrapper
      .findAll('input')
      .find((input) => input.element.value === '访客 4827')!;
    await nameInput.setValue('Personal');
    nameInput.element
      .closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.RENAME, {
      profileId: 'profile-1',
      displayName: 'Personal',
    });
    wrapper.unmount();
  });

  it('opens an unprotected local Profile without cloud authentication', async () => {
    const { wrapper, invoke } = mountView();
    await flushPromises();
    await wrapper.get('[data-testid="desktop-profile-open-profile-1"]').trigger('click');
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, { profileId: 'profile-1' });
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-connection-dialog"]').exists()).toBe(false);
  });

  it('shows the PIN input only after selecting a protected Profile', async () => {
    const { wrapper, invoke } = mountView(true);
    await flushPromises();
    await wrapper.get('[data-testid="desktop-profile-open-profile-1"]').trigger('click');

    expect(wrapper.find('[data-testid="desktop-profile-pin-profile-1"]').exists()).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());

    await wrapper.get('[data-testid="desktop-profile-pin-profile-1"]').setValue('482700');
    await wrapper
      .get('[data-testid="desktop-profile-pin-profile-1"]')
      .element.closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, {
      profileId: 'profile-1',
      pin: '482700',
    });
  });
});
