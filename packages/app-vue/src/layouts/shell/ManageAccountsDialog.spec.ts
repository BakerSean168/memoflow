import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { ok } from '@memoflow/transport-contracts/result';
import {
  ProfileAccessChannels,
  WindowChannels,
  type ProfileSummary,
  RenameProfileRequestSchema,
} from '@memoflow/desktop-contracts';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { useDesktopProfiles } from '../../shared/composables/useDesktopProfiles';
import ManageAccountsDialog from './ManageAccountsDialog.vue';
import shell from '../../locales/en-US/shell';
import auth from '../../locales/en-US/auth';

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const profile = (id: string, registered = false): ProfileSummary => ({
  profileId: id,
  profileKind: registered ? 'registered' : 'guest',
  displayName: 'Same name',
  avatarSeed: id,
  identifierHint: registered ? `${id}@example.com` : null,
  cloudAccountId: registered ? `cloud-${id}` : null,
  hasPin: id === 'protected',
  lastActiveAt: 1,
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function setup(registered = false) {
  const profiles = [profile('current', registered), profile('other'), profile('protected')];
  const invoke = vi.fn(async (channel: string, input?: unknown) => {
    if (channel === ProfileAccessChannels.LIST) return ok(profiles);
    if (channel === ProfileAccessChannels.GET_SNAPSHOT)
      return ok({
        profile: profiles[0],
        unlockState: 'UNLOCKED',
        cloudState: registered ? 'REAUTH_REQUIRED' : 'UNBOUND',
        capabilities: { local: true, sync: false, cloudAi: false, repositoryConnection: false },
      });
    if (channel === ProfileAccessChannels.CREATE_GUEST) return ok(profile('created'));
    if (channel === ProfileAccessChannels.RENAME) {
      const request = RenameProfileRequestSchema.parse(input);
      profiles.find((item) => item.profileId === request.profileId)!.displayName =
        request.displayName;
    }
    return ok(null);
  });
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const Host = defineComponent({
    components: { ManageAccountsDialog },
    setup() {
      return { presenter: useDesktopProfiles(), open: ref(true), trigger };
    },
    template:
      '<ManageAccountsDialog v-model:open="open" :presenter="presenter" :return-focus="trigger" />',
  });
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { shell, auth, common: { close: 'Close', cancel: 'Cancel' } } },
        }),
      ],
      provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
    },
  });
  cleanups.push(() => {
    wrapper.unmount();
    trigger.remove();
  });
  await flushPromises();
  return { wrapper, invoke, trigger };
}
function element(id: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  expect(found, id).not.toBeNull();
  return found!;
}

describe('ManageAccountsDialog', () => {
  it('lists metadata in a real dialog without leaving the workspace and returns focus on close', async () => {
    const { invoke, trigger } = await setup();
    expect(element('manage-accounts-dialog').getAttribute('role')).toBe('dialog');
    expect(element('desktop-profile-open-current').textContent).toContain('Current Profile');
    expect(document.querySelector('[data-testid="desktop-profile-remove-current"]')).toBeNull();
    expect(document.querySelector('[data-testid="shell-import-profile"]')).toBeNull();
    expect(element('shell-add-account')).toBeTruthy();
    expect(
      invoke.mock.calls.every(([channel]) =>
        new Set<string>([ProfileAccessChannels.LIST, ProfileAccessChannels.GET_SNAPSHOT]).has(
          channel,
        ),
      ),
    ).toBe(true);
    element('manage-accounts-dialog').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
  });

  it('offers import for a cloud Profile even when its cloud session is expired', async () => {
    const { wrapper, invoke } = await setup(true);
    expect(element('shell-import-profile')).toBeTruthy();
    expect(element('desktop-profile-open-current').textContent).toContain('current@example.com');
    element('shell-import-profile').click();
    element('shell-add-account').click();
    expect(wrapper.getComponent(ManageAccountsDialog).emitted('import-profile')).toEqual([[]]);
    expect(wrapper.getComponent(ManageAccountsDialog).emitted('add-account')).toEqual([[]]);
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
  });

  it('renames the exact ID and requires separate confirmation before removing from the device', async () => {
    const { invoke } = await setup();
    element('desktop-profile-rename-other').click();
    await flushPromises();
    const input = element(
      'desktop-profile-rename-other',
    ).parentElement!.parentElement!.querySelector('input')!;
    input.value = 'Personal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.RENAME, {
      profileId: 'other',
      displayName: 'Personal',
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    element('desktop-profile-remove-other').click();
    await flushPromises();
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, expect.anything());
    confirm.mockReturnValue(true);
    element('desktop-profile-remove-other').click();
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.REMOVE, { profileId: 'other' });
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.LOCK);
  });

  it('guards double guest creation and uses the host window lifecycle for the created ID', async () => {
    const { invoke } = await setup();
    const form = element('desktop-profile-create');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(
      invoke.mock.calls.filter(([channel]) => channel === ProfileAccessChannels.CREATE_GUEST),
    ).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_PROFILE_ACCESS, 'created');
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
  });

  it('hands off a PIN target preselected without submitting a PIN or reading target contents', async () => {
    const { invoke } = await setup();
    element('desktop-profile-open-protected').click();
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_PROFILE_ACCESS, 'protected');
    expect(invoke).not.toHaveBeenCalledWith(ProfileAccessChannels.SELECT, expect.anything());
  });

  it('keeps the workspace after a failed create and retries with the same idempotency key', async () => {
    const { invoke } = await setup();
    invoke.mockRejectedValueOnce(new Error('Host unavailable'));
    element('desktop-profile-create').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(invoke).not.toHaveBeenCalledWith(
      WindowChannels.TRANSITION_TO_PROFILE_ACCESS,
      expect.anything(),
    );
    element('desktop-profile-create').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flushPromises();
    const requests = invoke.mock.calls.filter(
      ([channel]) => channel === ProfileAccessChannels.CREATE_GUEST,
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]?.[1]).toEqual(requests[1]?.[1]);
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_PROFILE_ACCESS, 'created');
  });
});
