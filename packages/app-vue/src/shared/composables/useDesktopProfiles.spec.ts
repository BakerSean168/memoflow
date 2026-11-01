import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { ok } from '@memoflow/transport-contracts/result';
import {
  CloudAuthChannels,
  ProfileAccessChannels,
  WindowChannels,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { useDesktopProfiles } from './useDesktopProfiles';
import auth from '../../locales/en-US/auth';
import common from '../../locales/en-US/common';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>();
  return { ...actual, useConfirm: confirmMock };
});
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const profile = (id: string, overrides: Partial<ProfileSummary> = {}): ProfileSummary => ({
  profileId: id,
  profileKind: 'local',
  displayName: `Profile ${id}`,
  avatarSeed: id,
  identifierHint: null,
  cloudAccountId: null,
  hasCredential: false,
  remembered: false,
  lastActiveAt: 1,
  ...overrides,
});

function setup(activeProfileId: string | null = null, options: { accessWindow?: boolean } = {}) {
  const profiles = [profile('current'), profile('other')];
  const invoke = vi.fn(async (channel: string) => {
    if (channel === ProfileAccessChannels.LIST) return ok(profiles);
    if (channel === ProfileAccessChannels.GET_SNAPSHOT)
      return ok({
        profile: activeProfileId ? profile(activeProfileId) : null,
        unlockState: 'UNLOCKED',
        cloudState: 'UNBOUND',
        capabilities: { local: true, sync: false, cloudAi: false, repositoryConnection: false },
      });
    return ok(null);
  });
  const Host = defineComponent({
    setup() {
      return { presenter: useDesktopProfiles(options) };
    },
    template: '<div />',
  });
  const wrapper = mount(Host, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { auth, common } },
        }),
      ],
      provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
    },
  });
  const presenter = (wrapper.vm as unknown as { presenter: ReturnType<typeof useDesktopProfiles> })
    .presenter;
  return { wrapper, presenter, invoke };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
});

describe('useDesktopProfiles creation', () => {
  it('creates a local account with a nickname and password, then opens it with that password', async () => {
    const { wrapper, presenter, invoke } = setup();
    cleanups.push(() => wrapper.unmount());
    presenter.newName.value = 'Local one';
    presenter.newPassword.value = 'account-password';
    invoke.mockImplementation(async (channel: string) => {
      if (channel === ProfileAccessChannels.CREATE_LOCAL_ACCOUNT)
        return ok(profile('created', { displayName: 'Local one', hasCredential: true }));
      if (channel === ProfileAccessChannels.LIST) return ok([profile('created')]);
      if (channel === ProfileAccessChannels.GET_SNAPSHOT)
        return ok({
          profile: null,
          unlockState: 'LOCKED',
          cloudState: 'UNBOUND',
          capabilities: { local: false, sync: false, cloudAi: false, repositoryConnection: false },
        });
      return ok(null);
    });

    await presenter.createLocalAccount();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.CREATE_LOCAL_ACCOUNT, {
      displayName: 'Local one',
      password: 'account-password',
    });
    expect(presenter.newName.value).toBe('');
    expect(presenter.newPassword.value).toBe('');
  });

  it('refuses to create a local account without a nickname or a password of at least 8 characters', async () => {
    const { wrapper, presenter, invoke } = setup();
    cleanups.push(() => wrapper.unmount());
    presenter.newName.value = 'Local one';
    presenter.newPassword.value = 'short';

    await presenter.createLocalAccount();
    await flushPromises();

    expect(invoke).not.toHaveBeenCalledWith(
      ProfileAccessChannels.CREATE_LOCAL_ACCOUNT,
      expect.anything(),
    );
  });
});

describe('useDesktopProfiles sign-in and registration states', () => {
  const emptySnapshot = {
    profile: null,
    unlockState: 'LOCKED' as const,
    cloudState: 'UNBOUND' as const,
    capabilities: { local: false, sync: false, cloudAi: false, repositoryConnection: false },
  };

  function accessWindow(invokeImpl: (channel: string, payload?: unknown) => unknown) {
    const harness = setup(null, { accessWindow: true });
    cleanups.push(() => harness.wrapper.unmount());
    harness.invoke.mockImplementation(async (channel: string, payload?: unknown) => {
      if (channel === ProfileAccessChannels.LIST) return ok([]);
      if (channel === ProfileAccessChannels.GET_SNAPSHOT) return ok(emptySnapshot);
      return invokeImpl(channel, payload);
    });
    return harness;
  }

  it('moves between select, login and register and clears the forms on the way out', async () => {
    const { presenter } = accessWindow(() => ok(null));

    presenter.enterLoginState();
    expect(presenter.accessView.value).toBe('login');
    presenter.loginEmail.value = 'person@example.com';
    presenter.loginPassword.value = 'cloud-password';

    presenter.enterRegisterState('local');
    expect(presenter.accessView.value).toBe('register');
    expect(presenter.registerMode.value).toBe('local');

    presenter.backToSelect();
    expect(presenter.accessView.value).toBe('select');
    expect(presenter.loginEmail.value).toBe('');
    expect(presenter.loginPassword.value).toBe('');
    expect(presenter.registerEmail.value).toBe('');
    expect(presenter.registerPassword.value).toBe('');
  });

  it('asks the host for the registration height and the base height', async () => {
    const { presenter, invoke } = accessWindow(() => ok(null));

    await presenter.setAccessWindowHeight(780);
    expect(invoke).toHaveBeenCalledWith(WindowChannels.SET_PROFILE_ACCESS_HEIGHT, { height: 780 });

    await presenter.setAccessWindowHeight(640);
    expect(invoke).toHaveBeenCalledWith(WindowChannels.SET_PROFILE_ACCESS_HEIGHT, { height: 640 });
  });

  it('does not enter when the cloud sign-in is rejected', async () => {
    const { presenter, invoke } = accessWindow((channel) =>
      channel === CloudAuthChannels.SIGN_IN
        ? { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }
        : ok(null),
    );
    presenter.enterLoginState();
    presenter.loginEmail.value = 'person@example.com';
    presenter.loginPassword.value = 'wrong-password';

    await presenter.signInWithPassword();

    expect(invoke).toHaveBeenCalledWith(CloudAuthChannels.SIGN_IN, {
      email: 'person@example.com',
      password: 'wrong-password',
      remember: true,
    });
    expect(invoke).not.toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
    expect(presenter.accessView.value).toBe('login');
    expect(presenter.loginPassword.value).toBe('');
  });

  it('intercepts a mismatched cloud confirmation before any sign-up request', async () => {
    const { presenter, invoke } = accessWindow(() => ok(null));
    presenter.enterRegisterState('cloud');
    presenter.registerEmail.value = 'person@example.com';
    presenter.registerPassword.value = 'cloud-password';
    presenter.registerPasswordConfirm.value = 'other-password';

    await presenter.submitCloudRegistration();

    expect(invoke).not.toHaveBeenCalledWith(CloudAuthChannels.SIGN_UP, expect.anything());
    expect(presenter.accessView.value).toBe('register');
  });

  it('intercepts a mismatched local confirmation before any create request', async () => {
    const { presenter, invoke } = accessWindow(() => ok(null));
    presenter.enterRegisterState('local');
    presenter.registerName.value = 'Local two';
    presenter.registerPassword.value = 'local-password';
    presenter.registerPasswordConfirm.value = 'other-password';

    await presenter.submitLocalRegistration();

    expect(invoke).not.toHaveBeenCalledWith(
      ProfileAccessChannels.CREATE_LOCAL_ACCOUNT,
      expect.anything(),
    );
  });

  it('registers a cloud account and enters without a second sign-in', async () => {
    const { presenter, invoke } = accessWindow((channel) =>
      channel === CloudAuthChannels.SIGN_UP ? ok({ profileId: 'cloud-profile' }) : ok(null),
    );
    presenter.enterRegisterState('cloud');
    presenter.registerEmail.value = 'person@example.com';
    presenter.registerPassword.value = 'cloud-password';
    presenter.registerPasswordConfirm.value = 'cloud-password';

    await presenter.submitCloudRegistration();

    expect(invoke).toHaveBeenCalledWith(CloudAuthChannels.SIGN_UP, {
      email: 'person@example.com',
      password: 'cloud-password',
      name: undefined,
      remember: true,
    });
    expect(invoke).not.toHaveBeenCalledWith(CloudAuthChannels.SIGN_IN, expect.anything());
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
    expect(presenter.registerPassword.value).toBe('');
    expect(presenter.registerPasswordConfirm.value).toBe('');
  });
});

describe('useDesktopProfiles removal', () => {
  it('asks the global destructive confirm dialog and keeps the Profile when cancelled', async () => {
    confirmMock.mockResolvedValue(false);
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    const { wrapper, presenter, invoke } = setup();
    cleanups.push(() => wrapper.unmount());

    await presenter.removeProfile(profile('other'));
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: auth.profileAccess.removeConfirmTitle,
        description: auth.profileAccess.removeConfirm.replace('{name}', 'Profile other'),
        variant: 'destructive',
      }),
    );
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, expect.anything());
  });

  it('removes the exact Profile only after confirmation', async () => {
    const { wrapper, presenter, invoke } = setup();
    cleanups.push(() => wrapper.unmount());

    await presenter.removeProfile(profile('other'));
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, { profileId: 'other' });
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.LIST);
  });

  it('never offers to delete the active Profile', async () => {
    const { wrapper, presenter, invoke } = setup('current');
    cleanups.push(() => wrapper.unmount());

    await presenter.refreshProfiles();
    await presenter.removeProfile(profile('current'));
    await flushPromises();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, expect.anything());
  });
});

describe('useDesktopProfiles access routing', () => {
  const emptySnapshot = {
    profile: null,
    unlockState: 'LOCKED' as const,
    cloudState: 'UNBOUND' as const,
    capabilities: { local: false, sync: false, cloudAi: false, repositoryConnection: false },
  };

  async function accessWindowWith(
    list: ProfileSummary[],
    selectResult: (payload: unknown) => unknown = () => ok(null),
  ) {
    const harness = setup(null, { accessWindow: true });
    cleanups.push(() => harness.wrapper.unmount());
    harness.invoke.mockImplementation(async (channel: string, payload?: unknown) => {
      if (channel === ProfileAccessChannels.LIST) return ok(list);
      if (channel === ProfileAccessChannels.GET_SNAPSHOT) return ok(emptySnapshot);
      if (channel === ProfileAccessChannels.SELECT) return selectResult(payload);
      return ok(null);
    });
    await harness.presenter.refreshProfiles();
    return harness;
  }

  it('opens a remembered local account directly without asking for its password', async () => {
    const target = profile('remembered', { hasCredential: true, remembered: true });
    const { presenter, invoke } = await accessWindowWith([target]);

    await presenter.selectProfile(presenter.profiles.value[0]!);

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, {
      profileId: 'remembered',
    });
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
    expect(presenter.accessView.value).toBe('select');
  });

  it('switches to the password state for a local account without a remembered key', async () => {
    const target = profile('plain', { hasCredential: true, remembered: false });
    const { presenter, invoke } = await accessWindowWith([target]);

    await presenter.selectProfile(presenter.profiles.value[0]!);

    expect(presenter.accessView.value).toBe('password');
    expect(presenter.passwordTarget.value?.profileId).toBe('plain');
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
  });

  it('falls back to the password state when the remembered key can no longer be unsealed', async () => {
    const target = profile('stale', { hasCredential: true, remembered: true });
    const { presenter, invoke } = await accessWindowWith([target], () => ({
      ok: false,
      error: { code: 'PROFILE_PASSWORD_REQUIRED', message: '此本地账户需要密码解锁' },
    }));

    await presenter.selectProfile(presenter.profiles.value[0]!);

    expect(presenter.accessView.value).toBe('password');
    expect(presenter.passwordTarget.value?.profileId).toBe('stale');
    expect(invoke).not.toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
  });

  it('opens a registered Profile directly even though it has no remembered local key', async () => {
    const target = profile('work', {
      profileKind: 'registered',
      cloudAccountId: 'cloud-1',
      remembered: false,
    });
    const { presenter } = await accessWindowWith([target]);

    await presenter.selectProfile(presenter.profiles.value[0]!);

    expect(presenter.accessView.value).toBe('select');
  });

  it('sends the verified password and the remember choice when entering from the password state', async () => {
    const target = profile('plain', { hasCredential: true, remembered: false });
    const { presenter, invoke } = await accessWindowWith([target]);
    presenter.enterPasswordState(target);
    presenter.password.value = 'account-password';
    presenter.remember.value = true;

    await presenter.submitPassword();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, {
      profileId: 'plain',
      password: 'account-password',
      remember: true,
    });
  });

  it('returns to the account list without selecting anything', async () => {
    const target = profile('plain', { hasCredential: true });
    const { presenter, invoke } = await accessWindowWith([target]);
    presenter.enterPasswordState(target);
    presenter.password.value = 'account-password';

    presenter.backToSelect();

    expect(presenter.accessView.value).toBe('select');
    expect(presenter.passwordTarget.value).toBeNull();
    expect(presenter.password.value).toBe('');
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
  });
});
