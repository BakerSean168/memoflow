import { computed, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import type { useDesktopProfiles } from '../composables/useDesktopProfiles';
import DesktopProfileList from './DesktopProfileList.vue';
import auth from '../../locales/en-US/auth';
import shell from '../../locales/en-US/shell';
import common from '../../locales/en-US/common';

const profiles: ProfileSummary[] = [
  {
    profileId: 'profile-1',
    profileKind: 'local',
    displayName: 'Local 4827',
    avatarSeed: 'seed',
    identifierHint: null,
    cloudAccountId: null,
    hasCredential: false,
    lastActiveAt: 1,
  },
  {
    profileId: 'profile-2',
    profileKind: 'registered',
    displayName: 'Work',
    avatarSeed: 'seed-2',
    identifierHint: 'work@example.com',
    cloudAccountId: 'cloud-1',
    hasCredential: false,
    lastActiveAt: 2,
  },
];

function presenter() {
  const list = ref(profiles);
  return {
    profiles: computed(() => list.value),
    snapshot: ref(null),
    busyProfileId: ref<string | null>(null),
    selectedProfileId: ref<string | null>(null),
    password: ref(''),
    newName: ref(''),
    newPassword: ref(''),
    editingProfileId: ref<string | null>(null),
    editName: ref(''),
    refreshProfiles: vi.fn(async () => {}),
    openProfile: vi.fn(async () => {}),
    switchProfile: vi.fn(async () => {}),
    createLocalAccount: vi.fn(async () => {}),
    renameProfile: vi.fn(async () => {}),
    removeProfile: vi.fn(async () => {}),
  };
}

function mountList(options: { management?: boolean } = {}) {
  const fake = presenter();
  const wrapper = mount(DesktopProfileList, {
    attachTo: document.body,
    props: {
      presenter: fake as unknown as ReturnType<typeof useDesktopProfiles>,
      management: options.management,
    },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { auth, shell, common } },
        }),
      ],
    },
  });
  return { wrapper, presenter: fake };
}

function element(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe('DesktopProfileList', () => {
  it('renders access-mode tiles with only the name and the plus tile', () => {
    const { wrapper } = mountList();
    cleanups.push(() => wrapper.unmount());

    const tile = element('desktop-profile-open-profile-1')!;
    expect(tile.textContent).toContain('Local 4827');
    expect(tile.textContent).not.toContain('profile-1');
    expect(element('desktop-profile-create-local')).not.toBeNull();
    expect(element('desktop-profile-create')).toBeNull();
    expect(element('desktop-profile-rename-profile-1')).toBeNull();
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('reveals the Profile ID and deletion in the tile card, not in the resting tile', async () => {
    const { wrapper, presenter: fake } = mountList();
    cleanups.push(() => wrapper.unmount());

    expect(element('desktop-profile-menu-profile-2')).toBeNull();
    element('desktop-profile-open-profile-2')!.dispatchEvent(new FocusEvent('focus'));
    await flushPromises();

    expect(element('desktop-profile-menu-profile-2')!.textContent).toContain('work@example.com');
    element('desktop-profile-remove-profile-2')!.click();
    expect(fake.removeProfile).toHaveBeenCalledWith(profiles[1]);
  });

  it('asks for a nickname and password in management-mode creation', () => {
    const { wrapper, presenter: fake } = mountList({ management: true });
    cleanups.push(() => wrapper.unmount());

    const form = element('desktop-profile-create')!;
    expect(form.querySelectorAll('input')).toHaveLength(2);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(fake.createLocalAccount).toHaveBeenCalled();
  });

  it('keeps management-mode creation, inline rename and metadata intact', async () => {
    const { wrapper, presenter: fake } = mountList({ management: true });
    cleanups.push(() => wrapper.unmount());

    expect(element('desktop-profile-create')).not.toBeNull();
    expect(element('desktop-profile-create-local')).toBeNull();
    expect(element('desktop-profile-open-profile-2')!.textContent).toContain('work@example.com');
    expect(element('desktop-profile-rename-profile-2')).not.toBeNull();
    expect(element('desktop-profile-password-settings-profile-2')).not.toBeNull();

    element('desktop-profile-rename-profile-2')!.click();
    await flushPromises();
    const forms = wrapper.findAll('form');
    expect(forms).toHaveLength(2);
    forms[1]!.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(fake.renameProfile).toHaveBeenCalledWith(profiles[1]);
  });
});
