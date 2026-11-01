import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { ok } from '@memoflow/transport-contracts/result';
import {
  ProfileAccessChannels,
  WindowChannels,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import { DESKTOP_BRIDGE_KEY } from '../di/keys';
import DesktopProfileAccessView from './DesktopProfileAccessView.vue';
import auth from '../locales/en-US/auth';
import shell from '../locales/en-US/shell';
import common from '../locales/en-US/common';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>();
  return { ...actual, useConfirm: confirmMock };
});
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': { auth, shell, common } },
});

function profile(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    profileId: 'profile-1',
    profileKind: 'local',
    displayName: 'Local 4827',
    avatarSeed: 'seed',
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: 1,
    hasCredential: false,
    remembered: false,
    ...overrides,
  };
}

function mountView(
  options: {
    hasCredential?: boolean;
    remembered?: boolean;
    activeProfileId?: string | null;
    attachTo?: HTMLElement;
  } = {},
) {
  const profiles: ProfileSummary[] = [
    profile({
      hasCredential: options.hasCredential ?? false,
      remembered: options.remembered ?? false,
    }),
    profile({
      profileId: 'profile-2',
      profileKind: 'registered',
      displayName: 'Work',
      avatarSeed: 'seed-2',
      identifierHint: 'work@example.com',
      cloudAccountId: 'cloud-1',
    }),
  ];
  const invoke = vi.fn(async (channel: string, payload?: unknown) => {
    if (channel === ProfileAccessChannels.CREATE_LOCAL_ACCOUNT) {
      const created = profile({
        profileId: 'profile-3',
        displayName: (payload as { displayName: string }).displayName,
        hasCredential: true,
      });
      profiles.push(created);
      return ok(created);
    }
    if (channel === ProfileAccessChannels.LIST) return ok(profiles);
    if (channel === ProfileAccessChannels.GET_SNAPSHOT)
      return ok({
        profile: options.activeProfileId
          ? profiles.find((item) => item.profileId === options.activeProfileId)
          : null,
        unlockState: 'LOCKED',
        cloudState: 'UNBOUND',
        capabilities: { local: false, sync: false, cloudAi: false, repositoryConnection: false },
      });
    if (channel === ProfileAccessChannels.REMOVE) {
      const index = profiles.findIndex(
        (item) => item.profileId === (payload as { profileId: string }).profileId,
      );
      if (index >= 0) profiles.splice(index, 1);
    }
    return ok(undefined);
  });
  const wrapper = mount(DesktopProfileAccessView, {
    attachTo: options.attachTo,
    global: {
      plugins: [i18n],
      provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
    },
  });
  return { wrapper, invoke };
}

function element(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
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

describe('DesktopProfileAccessView', () => {
  it('preselects and focuses a password target passed by the host without opening its data', async () => {
    const previousHash = window.location.hash;
    window.location.hash = '#/profile-access?profileId=profile-1';
    const { wrapper, invoke } = mountView({ hasCredential: true, attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    try {
      await flushPromises();
      const passwordInput = element('desktop-profile-password-profile-1');
      expect(passwordInput).not.toBeNull();
      expect(document.activeElement).toBe(passwordInput);
      expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
    } finally {
      window.location.hash = previousHash;
    }
  });

  it('creates and opens an independent local account from the plus tile', async () => {
    const { wrapper, invoke } = mountView({ attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    element('desktop-profile-create-local')!.click();
    await flushPromises();
    const form = element('desktop-profile-create-form')!;
    const [name, password, confirmation] = form.querySelectorAll('input');
    name!.value = 'New local';
    name!.dispatchEvent(new Event('input', { bubbles: true }));
    password!.value = 'account-password';
    password!.dispatchEvent(new Event('input', { bubbles: true }));
    confirmation!.value = 'account-password';
    confirmation!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.CREATE_LOCAL_ACCOUNT, {
      displayName: 'New local',
      password: 'account-password',
    });
    expect(element('desktop-profile-open-profile-3')!.textContent).toContain('New local');
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, {
      profileId: 'profile-3',
      password: 'account-password',
      remember: false,
    });
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
  });

  it('opens a registered Profile directly without cloud authentication', async () => {
    const { wrapper, invoke } = mountView({ attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    element('desktop-profile-open-profile-2')!.click();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, { profileId: 'profile-2' });
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
    expect(element('desktop-profile-password-state')).toBeNull();
    expect(document.querySelector('input[type="email"]')).toBeNull();
    expect(element('cloud-connection-dialog')).toBeNull();
  });

  it('opens a remembered local account directly without the password state', async () => {
    const { wrapper, invoke } = mountView({
      hasCredential: true,
      remembered: true,
      attachTo: document.body,
    });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    element('desktop-profile-open-profile-1')!.click();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, { profileId: 'profile-1' });
    expect(element('desktop-profile-password-state')).toBeNull();
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_MAIN);
  });

  it('switches to the password state and sends the remember choice with the password', async () => {
    const { wrapper, invoke } = mountView({ hasCredential: true, attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    element('desktop-profile-open-profile-1')!.click();
    await flushPromises();
    expect(element('desktop-profile-password-state')).not.toBeNull();
    expect(element('desktop-profile-access')).toBeNull();
    expect(element('desktop-profile-password-profile-1')).not.toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());

    const input = element('desktop-profile-password-profile-1') as HTMLInputElement;
    input.value = 'account-password';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    element('desktop-profile-remember')!.click();
    await flushPromises();
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.SELECT, {
      profileId: 'profile-1',
      password: 'account-password',
      remember: true,
    });
  });

  it('returns to the account list from the password state without selecting anything', async () => {
    const { wrapper, invoke } = mountView({ hasCredential: true, attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    element('desktop-profile-open-profile-1')!.click();
    await flushPromises();
    element('desktop-profile-back')!.click();
    await flushPromises();

    expect(element('desktop-profile-password-state')).toBeNull();
    expect(element('desktop-profile-access')).not.toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
  });

  it('renders avatar tiles with only the display name and no inline editing', async () => {
    const { wrapper } = mountView({ attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    const tile = element('desktop-profile-open-profile-1')!;
    expect(tile.textContent).toContain('Local 4827');
    expect(tile.textContent).not.toContain('profile-1');
    expect(wrapper.text()).not.toContain('profile-1');
    expect(wrapper.text()).not.toContain('work@example.com');
    expect(wrapper.text()).not.toContain('Local account');
    expect(wrapper.find('[data-testid^="desktop-profile-rename-"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="desktop-profile-create"]').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('[data-testid="desktop-profile-create-local"]').exists()).toBe(true);
  });

  it('reveals metadata and the delete action on hover after a dwell', async () => {
    const { wrapper } = mountView({ attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    element('desktop-profile-open-profile-2')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(element('desktop-profile-menu-profile-2')).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 260));
    await flushPromises();

    const menu = element('desktop-profile-menu-profile-2');
    expect(menu).not.toBeNull();
    expect(menu!.textContent).toContain('Work');
    expect(menu!.textContent).toContain('Cloud connected');
    expect(menu!.textContent).toContain('work@example.com');
    expect(element('desktop-profile-remove-profile-2')).not.toBeNull();
  });

  it('keeps the Profile when the custom confirmation is cancelled and deletes it when confirmed', async () => {
    const nativeConfirm = vi.fn(() => false);
    vi.stubGlobal('confirm', nativeConfirm);
    const { wrapper, invoke } = mountView({ attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    confirmMock.mockResolvedValueOnce(false);
    (element('desktop-profile-open-profile-2') as HTMLButtonElement).dispatchEvent(
      new FocusEvent('focus'),
    );
    await flushPromises();
    element('desktop-profile-remove-profile-2')!.click();
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: auth.profileAccess.removeConfirmTitle,
        description: auth.profileAccess.removeConfirm.replace('{name}', 'Work'),
        variant: 'destructive',
      }),
    );
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, expect.anything());

    confirmMock.mockResolvedValueOnce(true);
    (element('desktop-profile-open-profile-2') as HTMLButtonElement).dispatchEvent(
      new FocusEvent('focus'),
    );
    await flushPromises();
    element('desktop-profile-remove-profile-2')!.click();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, { profileId: 'profile-2' });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('never offers the active Profile for deletion', async () => {
    const { wrapper } = mountView({ activeProfileId: 'profile-2', attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    (element('desktop-profile-open-profile-2') as HTMLButtonElement).focus();
    await flushPromises();

    expect(element('desktop-profile-menu-profile-2')!.textContent).toContain('Current Profile');
    expect(element('desktop-profile-remove-profile-2')).toBeNull();
  });

  it('supports focus reveal, ArrowDown into the actions and Escape to dismiss', async () => {
    const { wrapper } = mountView({ attachTo: document.body });
    cleanups.push(() => wrapper.unmount());
    await flushPromises();

    const tile = element('desktop-profile-open-profile-2')! as HTMLButtonElement;
    tile.dispatchEvent(new FocusEvent('focus'));
    await flushPromises();
    expect(element('desktop-profile-menu-profile-2')).not.toBeNull();

    tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flushPromises();
    const openAction = element('desktop-profile-menu-open-profile-2');
    expect(openAction).not.toBeNull();
    expect(document.activeElement).toBe(openAction);

    openAction!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(tile.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(tile);
  });
});
