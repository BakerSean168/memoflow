import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { ok } from '@memoflow/transport-contracts/result';
import { ProfileAccessChannels, type ProfileSummary } from '@memoflow/desktop-contracts';
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
  profileKind: 'guest',
  displayName: `Profile ${id}`,
  avatarSeed: id,
  identifierHint: null,
  cloudAccountId: null,
  hasPin: false,
  lastActiveAt: 1,
  ...overrides,
});

function setup(activeProfileId: string | null = null) {
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
      return { presenter: useDesktopProfiles() };
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
