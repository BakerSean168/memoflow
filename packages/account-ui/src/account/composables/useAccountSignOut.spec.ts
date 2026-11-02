import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { _getConfirmState, _resolveConfirm } from '@memoflow/ui-vue-shadcn';
import {
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  LOGOUT_HANDLER_KEY,
} from '@account-ui-test-host/di/keys';
import { useAccountSignOut } from './useAccountSignOut';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { cancel: 'Cancel' },
      account: {
        logoutHandlerUnavailable: 'Sign-out is unavailable',
        logoutConfirm: {
          title: 'Log out',
          description: 'Cloud sync pauses; local data stays.',
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
      },
    },
  },
});

interface MountOptions {
  profileKind?: 'local' | 'registered';
  withDesktop?: boolean;
  logout?: (() => Promise<void>) | null;
}

function mountComposable(options: MountOptions = {}) {
  const { profileKind = 'local', withDesktop = true, logout = vi.fn().mockResolvedValue(undefined) } =
    options;
  let composable!: ReturnType<typeof useAccountSignOut>;
  const provide: Record<symbol, unknown> = {};
  if (logout) provide[LOGOUT_HANDLER_KEY as symbol] = logout;
  if (withDesktop) {
    provide[DESKTOP_BRIDGE_KEY as symbol] = { invoke: vi.fn() };
    provide[DESKTOP_ACCESS_SNAPSHOT_KEY as symbol] = ref({
      profile: {
        profileId: 'profile-1',
        profileKind,
        displayName: 'Local',
        avatarSeed: 'seed',
        identifierHint: null,
        cloudAccountId: null,
        lastActiveAt: 1,
        hasCredential: false,
        remembered: false,
      },
      unlockState: 'UNLOCKED',
      cloudState: 'UNBOUND',
      capabilities: { local: true, sync: false, cloudAi: false, repositoryConnection: false },
    });
  }

  mount(
    defineComponent({
      setup() {
        composable = useAccountSignOut();
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n], provide } },
  );

  return { composable, logout };
}

describe('useAccountSignOut', () => {
  it('asks the local-account wording for a local Profile', async () => {
    const { composable } = mountComposable({ profileKind: 'local' });

    expect(composable.isDesktopSignOut.value).toBe(true);
    const pending = composable.confirmSignOut();

    expect(_getConfirmState()).toMatchObject({
      title: 'Delete local account?',
      description: 'Everything is deleted.',
      confirmText: 'Sign out',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    _resolveConfirm(true);
    await expect(pending).resolves.toBe(true);
  });

  it('asks the cloud-account wording for a registered Profile', async () => {
    const { composable } = mountComposable({ profileKind: 'registered' });

    const pending = composable.confirmSignOut();

    expect(_getConfirmState()).toMatchObject({
      title: 'Delete this device data?',
      description: 'Unsynced changes are lost; the cloud account remains.',
    });

    _resolveConfirm(false);
    await expect(pending).resolves.toBe(false);
  });

  it('keeps the cloud-only wording when the host is the web surface', async () => {
    const { composable } = mountComposable({ withDesktop: false });

    expect(composable.isDesktopSignOut.value).toBe(false);
    const pending = composable.confirmSignOut();

    expect(_getConfirmState()).toMatchObject({
      title: 'Log out',
      description: 'Cloud sync pauses; local data stays.',
      confirmText: 'Log out',
    });

    _resolveConfirm(true);
    await expect(pending).resolves.toBe(true);
  });

  it('runs the injected execution handler without asking again', async () => {
    const { composable, logout } = mountComposable();

    await composable.executeSignOut();

    expect(logout).toHaveBeenCalledOnce();
  });

  it('fails loudly when the host provides no execution handler', async () => {
    const { composable } = mountComposable({ logout: null });

    await expect(composable.executeSignOut()).rejects.toThrow('Sign-out is unavailable');
  });
});
