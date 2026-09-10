import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { fail } from '@memoflow/contracts/result';
import type { IAccountService } from '../../../di/types';
import {
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_LOCK_HANDLER_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
} from '../../../di/keys';
import { ProfileAccessChannels } from '@memoflow/contracts/electron';
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
      account: {
        center: 'Account',
        description: 'Manage your account.',
        guestLabel: 'Local guest',
        emailVerified: 'Login email verified',
        emailUnverified: 'Login email not verified',
        status: { loading: 'Loading profile...' },
        actions: { saveProfile: 'Save', logout: 'Log out', lockProfile: 'Lock Profile' },
        lockProfileHint: 'Lock local data.',
        localProtection: {
          title: 'Local Profile protection',
          description: 'Device protection',
          toggle: 'Use a local PIN',
          hint: 'Off by default',
          pin: 'Local PIN',
          confirmPin: 'Confirm local PIN',
          pinPlaceholder: '6 to 12 digits',
          enable: 'Enable PIN',
          enabled: 'PIN enabled',
          invalidPin: 'Invalid PIN',
          pinMismatch: 'PIN mismatch',
          enableFailed: 'Enable failed',
          removeTitle: 'Remove?',
          removeDescription: 'Remove PIN',
          removeConfirm: 'Remove',
          removeFailed: 'Remove failed',
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

function mountSection(
  accountService: IAccountService,
  lockProfile?: () => Promise<void>,
  cloudConnected = false,
  desktop?: { invoke: ReturnType<typeof vi.fn>; hasPin?: boolean },
) {
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
        [LOGOUT_HANDLER_KEY as symbol]: vi.fn(),
        ...(lockProfile ? { [PROFILE_LOCK_HANDLER_KEY as symbol]: lockProfile } : {}),
        ...(desktop
          ? {
              [DESKTOP_BRIDGE_KEY as symbol]: { invoke: desktop.invoke },
              [DESKTOP_ACCESS_SNAPSHOT_KEY as symbol]: ref({
                profile: {
                  profileId: 'profile-1',
                  profileKind: 'guest',
                  displayName: 'Guest',
                  avatarSeed: 'seed',
                  identifierHint: null,
                  cloudAccountId: null,
                  lastActiveAt: 1,
                  hasPin: desktop.hasPin === true,
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

describe('AccountProfileSection', () => {
  it('shows a retryable error instead of an endless loading state', async () => {
    const getMyProfile = vi
      .fn()
      .mockResolvedValue(fail({ code: 'NOT_FOUND', message: 'Account not found' }));
    const accountService = {
      getMyProfile,
      updateMyProfile: vi.fn(),
      closeAccount: vi.fn(),
    } as unknown as IAccountService;

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

  it('lets a guest edit local Profile data and lock it without showing cloud logout', async () => {
    const lockProfile = vi.fn().mockResolvedValue(undefined);
    const dto = {
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
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: { toDTO: () => dto }, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: { toDTO: () => dto }, cloudIdentity: null },
      }),
    } as unknown as IAccountService;

    const wrapper = mountSection(accountService, lockProfile);
    await flushPromises();

    expect(wrapper.get('#nickname').attributes('disabled')).not.toBe('true');
    expect(wrapper.get('#avatar').attributes('disabled')).not.toBe('true');
    expect(wrapper.get('#bio').attributes('disabled')).not.toBe('true');
    expect(wrapper.text()).toContain('Local guest');
    expect(wrapper.find('[data-testid="account-logout-button"]').exists()).toBe(false);
    await wrapper.get('[data-testid="account-lock-profile-button"]').trigger('click');
    expect(lockProfile).toHaveBeenCalledOnce();
  });

  it('keeps cloud sign-out distinct from local Profile lock for a connected account', async () => {
    const lockProfile = vi.fn().mockResolvedValue(undefined);
    const dto = {
      id: 'cloud-1',
      status: 'Active',
      profile: {
        nickname: 'User',
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
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: { toDTO: () => dto }, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: { toDTO: () => dto }, cloudIdentity: null },
      }),
    } as unknown as IAccountService;

    const wrapper = mountSection(accountService, lockProfile, true);
    await flushPromises();

    expect(wrapper.text()).toContain('user@example.com');
    expect(wrapper.text()).toContain('Login email verified');
    expect(wrapper.find('[data-testid="account-logout-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="account-lock-profile-button"]').exists()).toBe(true);
  });

  it('keeps local PIN off by default and enables it only after confirmation', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: null });
    const dto = {
      id: 'guest_1',
      status: 'Active',
      profile: {
        nickname: 'Guest',
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
    const accountService = {
      getMyProfile: vi.fn().mockResolvedValue({
        ok: true,
        data: { account: { toDTO: () => dto }, cloudIdentity: null },
      }),
      updateMyProfile: vi.fn(),
    } as unknown as IAccountService;
    const wrapper = mountSection(accountService, undefined, false, { invoke });
    await flushPromises();

    expect(wrapper.get('[data-testid="account-local-pin-toggle"]').attributes('aria-checked')).toBe(
      'false',
    );
    expect(wrapper.find('[data-testid="account-local-pin"]').exists()).toBe(false);
    await wrapper.get('[data-testid="account-local-pin-toggle"]').trigger('click');
    await wrapper.get('[data-testid="account-local-pin"]').setValue('482700');
    await wrapper.get('[data-testid="account-local-pin-confirmation"]').setValue('482700');
    await wrapper
      .get('[data-testid="account-local-pin-save"]')
      .element.closest('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.PIN_SET, '482700');
    expect(wrapper.get('[data-testid="account-local-pin-toggle"]').attributes('aria-checked')).toBe(
      'true',
    );
  });
});
