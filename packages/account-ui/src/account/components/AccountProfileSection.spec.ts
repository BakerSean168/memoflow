import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { fail } from '@memoflow/transport-contracts/result';
import { _getConfirmState, _resolveConfirm } from '@memoflow/ui-vue-shadcn';
import type { AccountClientPort } from '@memoflow/account-client';
import {
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  LOGOUT_HANDLER_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
} from '@account-ui-test-host/di/keys';
import { ProfileAccessChannels } from '@memoflow/desktop-contracts';
import AccountProfileSection from './AccountProfileSection.vue';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';

vi.mock('../../authentication/composables/useSession', async () => {
  const { ref } = await import('vue');
  return {
    useSession: () => ({
      activeSessions: ref([]),
      loadSessions: vi.fn().mockResolvedValue(true),
      revokeSession: vi.fn().mockResolvedValue(true),
    }),
  };
});

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { retry: 'Retry', cancel: 'Cancel' },
      errors: { NOT_FOUND: 'Account not found' },
      auth: { toast: { loggedOut: 'Logged out' } },
      account: {
        center: 'Account',
        description: 'Manage your account.',
        guestLabel: 'Local guest',
        emailVerified: 'Login email verified',
        emailUnverified: 'Login email not verified',
        status: { loading: 'Loading profile...' },
        actions: { saveProfile: 'Save', logout: 'Log out' },
        localPassword: {
          title: 'Local account password',
          description: 'Local protection',
          newPassword: 'New password',
          confirmPassword: 'Confirm new password',
          placeholder: 'At least 8 characters',
          save: 'Change password',
          saved: 'Password updated',
          failed: 'Change failed',
          mismatch: 'Passwords do not match',
          tooShort: 'Too short',
          removed: 'PIN removed',
        },
        profile: { nickname: 'Nickname', avatarUrl: 'Avatar', bio: 'Bio' },
        placeholder: { nickname: 'Nickname', avatarUrl: 'Avatar URL', bio: 'Bio' },
        logoutHint: 'Sign out of this device.',
        toast: { loadFailed: 'Failed to load profile' },
        logoutConfirm: {
          title: 'Log out',
          description: 'Confirm logout.',
          confirmText: 'Log out',
          cancelText: 'Cancel',
        },
        signOut: {
          action: 'Sign out',
          hint: 'Remove this account from this device.',
          confirm: {
            local: { title: 'Delete local account?', description: 'Everything is deleted.' },
            registered: {
              title: 'Delete this device data?',
              description: 'Unsynced changes are lost; the cloud account remains.',
            },
          },
        },
        oauth: {
          title: 'Sign-in methods',
          description: 'Link GitHub for identity only.',
          githubLinked: 'GitHub linked',
          githubNotLinked: 'GitHub not linked',
          bindGithub: 'Link GitHub',
          unbindGithub: 'Unlink GitHub',
          bindSuccess: 'linked',
          unbindSuccess: 'unlinked',
          bindFailed: 'bind failed',
          unbindFailed: 'unbind failed',
          githubUnavailable: 'unavailable',
          serviceUnavailable: 'service unavailable',
          alreadyLinked: 'already linked',
          lastLoginPath: 'last path',
          invalidState: 'invalid state',
          unbindConfirmTitle: 'Unlink?',
          unbindConfirmDescription: 'Confirm unlink',
          unbindConfirmText: 'Unlink',
          repoScopeHint: 'repo hint',
        },
        sessions: {
          title: 'Devices & sessions',
          description: 'Manage sessions',
          loading: 'Loading sessions…',
          empty: 'No active sessions',
          current: 'This device',
          lastActive: 'Last active',
          revoke: 'Revoke',
          refresh: 'Refresh',
          unknownDevice: 'Unknown device',
          cannotRevokeCurrent: 'Cannot revoke current',
          revokeConfirmTitle: 'Revoke?',
          revokeConfirmDescription: 'Need re-login',
          revokeConfirmText: 'Revoke',
        },
      },
    },
  },
});

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

const InputStub = defineComponent({
  name: 'InputStub',
  inheritAttrs: false,
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const SwitchStub = defineComponent({
  name: 'SwitchStub',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('button', {
        ...attrs,
        type: 'button',
        disabled: props.disabled,
        'aria-checked': String(props.modelValue),
        onClick: () => emit('update:modelValue', !props.modelValue),
      });
  },
});

interface MountOptions {
  cloudConnected?: boolean;
  logout?: () => Promise<void>;
  desktop?: {
    invoke: ReturnType<typeof vi.fn>;
    hasCredential?: boolean;
    profileKind?: 'local' | 'registered';
  };
}

function mountSection(accountService: AccountClientPort, options: MountOptions = {}) {
  const { cloudConnected = false, logout = vi.fn(), desktop } = options;
  const pinia = createPinia();
  const authStore = useAuthenticationStore(pinia);
  if (cloudConnected) {
    authStore.hydrateCloudSession({
      account: {
        id: 'cloud-1',
        email: 'user@example.com',
        name: 'User',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    });
  }
  return mount(AccountProfileSection, {
    global: {
      plugins: [pinia, i18n],
      provide: {
        [ACCOUNT_SERVICE_KEY as symbol]: accountService,
        [AUTH_SERVICE_KEY as symbol]: {
          getCurrentUser: vi.fn().mockResolvedValue({
            ok: true,
            data: {
              identity: { hasOAuth: false },
              session: null,
              emailVerification: { required: false },
            },
          }),
          getOAuthUrl: vi.fn(),
          bindOAuth: vi.fn(),
          unbindOAuth: vi.fn(),
        },
        [LOGOUT_HANDLER_KEY as symbol]: logout,
        ...(desktop
          ? {
              [DESKTOP_BRIDGE_KEY as symbol]: { invoke: desktop.invoke },
              [DESKTOP_ACCESS_SNAPSHOT_KEY as symbol]: ref({
                profile: {
                  profileId: 'profile-1',
                  profileKind: desktop.profileKind ?? 'local',
                  displayName: 'Local',
                  avatarSeed: 'seed',
                  identifierHint: null,
                  cloudAccountId: null,
                  lastActiveAt: 1,
                  hasCredential: desktop.hasCredential === true,
                  remembered: false,
                },
                unlockState: 'UNLOCKED',
                cloudState: 'UNBOUND',
                capabilities: {
                  local: true,
                  sync: false,
                  cloudAi: false,
                  repositoryConnection: false,
                },
              }),
            }
          : {}),
      },
      stubs: {
        Button: ButtonStub,
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        CardDescription: PassthroughStub,
        CardFooter: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        Input: InputStub,
        Label: true,
        Avatar: PassthroughStub,
        AvatarFallback: PassthroughStub,
        AvatarImage: true,
        Separator: true,
        Switch: SwitchStub,
        LogOut: true,
        GitBranch: true,
        Link2Off: true,
      },
    },
  });
}

const guestDto = {
  id: 'guest_1',
  status: 'Active',
  profile: {
    nickname: 'Guest 4827',
    realName: null,
    avatarUrl: null,
    bio: null,
    gender: 'Unspecified',
    birthday: null,
  },
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  closedAt: null,
} as const;

describe('AccountProfileSection', () => {
  it('shows a retryable error instead of an endless loading state', async () => {
    const getMyProfile = vi
      .fn()
      .mockResolvedValue(fail({ code: 'NOT_FOUND', message: 'Account not found' }));
    const accountService = {
      getMyProfile,
      updateMyProfile: vi.fn(),
      closeAccount: vi.fn(),
    } as unknown as AccountClientPort;

    const wrapper = mountSection(accountService);
    await flushPromises();

    expect(wrapper.get('[data-testid="account-profile-error"]').text()).toContain(
      'Account not found',
    );
    expect(wrapper.find('[data-testid="account-profile-loading"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="account-oauth-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="account-sessions-card"]').exists()).toBe(false);

    await wrapper.get('[data-testid="account-profile-retry"]').trigger('click');
    await flushPromises();

    expect(getMyProfile).toHaveBeenCalledTimes(2);
  });

  it('lets a guest edit local Profile data without showing a sign-out action', async () => {
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
    } as unknown as AccountClientPort;

    const wrapper = mountSection(accountService);
    await flushPromises();

    expect(wrapper.get('#nickname').attributes('disabled')).not.toBe('true');
    expect(wrapper.get('#avatar').attributes('disabled')).not.toBe('true');
    expect(wrapper.get('#bio').attributes('disabled')).not.toBe('true');
    expect(wrapper.text()).toContain('Local guest');
    expect(wrapper.find('[data-testid="account-logout-button"]').exists()).toBe(false);
  });

  it('asks the local-account confirmation and signs out once confirmed', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn(),
    } as unknown as AccountClientPort;

    const wrapper = mountSection(accountService, {
      logout,
      desktop: { invoke: vi.fn().mockResolvedValue({ ok: true, data: null }) },
    });
    await flushPromises();

    await wrapper.get('[data-testid="account-logout-button"]').trigger('click');
    await flushPromises();

    expect(_getConfirmState().title).toBe('Delete local account?');
    expect(_getConfirmState().description).toBe('Everything is deleted.');
    expect(logout).not.toHaveBeenCalled();

    _resolveConfirm(true);
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
  });

  it('asks the cloud-account confirmation for a registered Profile', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn(),
    } as unknown as AccountClientPort;

    const wrapper = mountSection(accountService, {
      logout,
      desktop: {
        invoke: vi.fn().mockResolvedValue({ ok: true, data: null }),
        profileKind: 'registered',
      },
    });
    await flushPromises();

    await wrapper.get('[data-testid="account-logout-button"]').trigger('click');
    await flushPromises();

    expect(_getConfirmState().title).toBe('Delete this device data?');
    expect(_getConfirmState().description).toBe(
      'Unsynced changes are lost; the cloud account remains.',
    );

    _resolveConfirm(false);
    await flushPromises();

    expect(logout).not.toHaveBeenCalled();
  });

  it('keeps the cloud logout wording on the web surface', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn(),
    } as unknown as AccountClientPort;

    const wrapper = mountSection(accountService, { logout, cloudConnected: true });
    await flushPromises();

    expect(wrapper.text()).toContain('user@example.com');
    expect(wrapper.text()).toContain('Login email verified');
    expect(wrapper.get('[data-testid="account-logout-button"]').text()).toContain('Log out');

    await wrapper.get('[data-testid="account-logout-button"]').trigger('click');
    await flushPromises();

    expect(_getConfirmState().title).toBe('Log out');
    expect(_getConfirmState().description).toBe('Confirm logout.');

    _resolveConfirm(true);
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
  });

  it('changes the local account password only when both entries match', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: null });
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn(),
    } as unknown as AccountClientPort;
    const wrapper = mountSection(accountService, { desktop: { invoke } });
    await flushPromises();

    const form = wrapper.get('[data-testid="account-local-password"]');
    await wrapper.get('[data-testid="account-local-password-new"]').setValue('account-password');
    await wrapper
      .get('[data-testid="account-local-password-confirmation"]')
      .setValue('other-password');
    form.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.PASSWORD_SET, expect.anything());

    await wrapper
      .get('[data-testid="account-local-password-confirmation"]')
      .setValue('account-password');
    form.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.PASSWORD_SET, 'account-password');
    expect(
      (wrapper.get('[data-testid="account-local-password-new"]').element as HTMLInputElement).value,
    ).toBe('');
  });

  it('hides the local password card for a registered Profile', async () => {
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: guestDto, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn(),
    } as unknown as AccountClientPort;
    const invoke = vi.fn();
    const wrapper = mountSection(accountService, {
      desktop: { invoke, profileKind: 'registered' },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="account-local-password"]').exists()).toBe(false);
  });
});
