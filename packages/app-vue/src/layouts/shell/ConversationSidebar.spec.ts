import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ConversationSidebar from './ConversationSidebar.vue';
import auth from '../../locales/en-US/auth';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      auth,
      common: { loading: 'Loading', more: 'More', delete: 'Delete' },
      aiAssistant: {
        chatPage: {
          sidebar: {
            attention: {
              failed: 'Execution failed',
              input: 'Answer required',
              approval: 'Approval required',
              working: 'Working',
              done: 'New result',
            },
          },
        },
      },
      shell: {
        search: 'Search',
        newChat: 'New Chat',
        guest: 'Guest',
        conversation: {
          today: 'Today',
          last7Days: 'Last 7 days',
          earlier: 'Earlier',
          resize: 'Resize conversation sidebar',
          searchPlaceholder: 'Search conversations…',
          noMatches: 'No matching conversations',
          clearSearch: 'Clear conversation search',
          archived: 'Archived',
          active: 'Active',
          archive: 'Archive',
          restore: 'Restore',
          previousPage: 'Previous page',
          nextPage: 'Next page',
          select: 'Select conversations',
          cancelSelect: 'Cancel selection',
          selectAll: 'Select all',
          clearSelection: 'Clear selection',
          archiveSelected: 'Archive selected',
          restoreSelected: 'Restore selected',
          deleteSelected: 'Delete selected',
        },
        account: {
          menu: 'Account menu',
          signedIn: 'Signed in',
          localProfile: 'Local Profile',
          guestIdentity: 'Guest',
          accountAndPrivacy: 'Account & privacy',
          settings: 'Settings',
          logout: 'Sign out',
          connectCloud: 'Connect cloud',
          reauthenticate: 'Sign in again',
          switchAccount: 'Switch account',
          manageProfiles: 'Manage accounts',
          currentProfile: 'Current Profile',
          connection: { unknown: 'Not checked' },
        },
      },
    },
  },
});

const groups = [
  {
    labelKey: 'shell.conversation.today',
    items: [
      { id: 'a', title: 'Personal systems architecture' },
      { id: 'b', title: 'Training plan' },
    ],
  },
  {
    labelKey: 'shell.conversation.earlier',
    items: [{ id: 'c', title: 'Infrastructure migration' }],
  },
];

describe('ConversationSidebar attention', () => {
  it('archives without confirmation and exposes searchable recovery with guarded pending rows', async () => {
    const originalConfirm = window.confirm;
    const confirm = vi.fn();
    window.confirm = confirm;
    const wrapper = mount(ConversationSidebar, {
      props: {
        groups,
        activeConversationId: 'b',
        conversationStatuses: { a: 'working' },
        archivedConversations: [{ id: 'old', title: 'Archived history' }],
      },
      global: { plugins: [i18n] },
    });
    try {
      const archive = wrapper.findAll('[data-testid="conversation-archive"]');
      expect(archive[0]!.attributes('disabled')).toBeDefined();
      await archive[1]!.trigger('click');
      expect(wrapper.emitted('archive-conversation')).toEqual([['b']]);
      expect(confirm).not.toHaveBeenCalled();
      await wrapper.get('[data-testid="conversation-archive-toggle"]').trigger('click');
      expect(wrapper.text()).toContain('Archived history');
      expect(wrapper.text()).not.toContain('Training plan');
      await wrapper.get('[data-testid="conversation-restore"]').trigger('click');
      expect(wrapper.emitted('restore-conversation')).toEqual([['old']]);
    } finally {
      window.confirm = originalConfirm;
      wrapper.unmount();
    }
  });
  it('displays semantic status icons and preserves conversation navigation', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: {
        groups,
        activeConversationId: 'b',
        conversationStatuses: { a: 'working', c: 'done' },
      },
      global: { plugins: [i18n] },
    });
    const icons = wrapper.findAll('[data-testid="shell-conversation-status"]');
    expect(icons).toHaveLength(2);
    expect(icons[0]!.attributes('aria-label')).toBe('Working');
    expect(icons[0]!.find('svg').classes()).toContain('text-[#7DD3FC]');
    expect(icons[1]!.attributes('aria-label')).toBe('New result');
    expect(icons[1]!.find('svg').classes()).toContain('text-[#6EE7B7]');
    const firstRow = wrapper
      .findAll('nav button')
      .find((item) => item.text() === 'Personal systems architecture');
    expect(firstRow?.classes()).toContain('pr-24');
    expect(firstRow?.find('span').classes()).toContain('truncate');
    const normalRow = wrapper.findAll('nav button').find((item) => item.text() === 'Training plan');
    expect(normalRow?.classes()).toContain('pr-24');
    await icons[0]!.trigger('click');
    expect(wrapper.emitted('select-conversation')).toEqual([['a']]);
    wrapper.unmount();
  });
});

describe('ConversationSidebar search', () => {
  it('returns keyboard focus to search after Escape and preserves conversation navigation', async () => {
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: { groups, activeConversationId: 'b' },
      global: { plugins: [i18n] },
    });
    try {
      const toggle = wrapper.get('[data-testid="conversation-search-toggle"]');
      expect(toggle.classes()).toEqual(expect.arrayContaining(['h-8', 'min-w-0']));
      await toggle.trigger('click');
      const input = wrapper.get('[data-testid="conversation-search-input"]');
      expect(document.activeElement).toBe(input.element);
      await input.setValue('TRAINING');
      const conversation = wrapper
        .findAll('nav button')
        .find((button) => button.text() === 'Training plan');
      await conversation!.trigger('click');
      expect(wrapper.emitted('select-conversation')).toEqual([['b']]);
      await input.trigger('keydown', { key: 'Escape' });
      expect(wrapper.find('[data-testid="conversation-search-input"]').exists()).toBe(false);
      expect(toggle.attributes('aria-pressed')).toBe('false');
      expect(document.activeElement).toBe(toggle.element);
      expect(wrapper.text()).toContain('Infrastructure migration');
      expect(wrapper.emitted('new-conversation')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('filters existing conversations locally instead of starting a new conversation', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: null },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="conversation-search-toggle"]').trigger('click');
    await wrapper.get('[data-testid="conversation-search-input"]').setValue('infra');

    expect(wrapper.text()).toContain('Infrastructure migration');
    expect(wrapper.text()).not.toContain('Training plan');
    expect(wrapper.emitted('new-conversation')).toBeUndefined();
  });

  it('shows a bounded empty state and clears search without mutating conversation data', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: null },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="conversation-search-toggle"]').trigger('click');
    await wrapper.get('[data-testid="conversation-search-input"]').setValue('not-found');
    expect(wrapper.get('[data-testid="conversation-search-empty"]').text()).toBe(
      'No matching conversations',
    );

    const clear = wrapper.get('[data-testid="conversation-search-clear"]');
    expect(clear.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8']));
    await clear.trigger('click');
    expect(wrapper.text()).toContain('Personal systems architecture');
    expect(wrapper.text()).toContain('Infrastructure migration');
  });
});
describe('ConversationSidebar compact toolbar', () => {
  it('selects visible conversations and emits one bulk action', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: null },
      global: { plugins: [i18n] },
    });
    await wrapper.get('[data-testid="conversation-select-toggle"]').trigger('click');
    await wrapper.get('[data-testid="conversation-select-all"]').trigger('click');
    expect(wrapper.get('[data-testid="conversation-selection-count"]').text()).toBe('3');
    await wrapper.get('[data-testid="conversation-bulk-status"]').trigger('click');
    expect(wrapper.emitted('archive-conversations')).toEqual([[['a', 'b', 'c']]]);
    expect(wrapper.find('[data-testid="conversation-selection-toolbar"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps searchable conversations and new chat in a single 44px row', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: 'a' },
      global: { plugins: [i18n] },
    });
    try {
      const toolbar = wrapper.get('[data-testid="conversation-toolbar"]');
      const search = toolbar.get('[data-testid="conversation-search-toggle"]');
      const create = toolbar.get('[data-testid="shell-new-conversation"]');
      expect(toolbar.classes()).toContain('h-11');
      expect(create.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8', 'shrink-0']));
      expect(create.attributes('aria-label')).toBe('New Chat');
      expect(create.text()).toBe('');
      expect(wrapper.text()).not.toContain('MemoFlow');
      await search.trigger('click');
      expect(toolbar.find('[data-testid="conversation-search-input"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-testid="conversation-toolbar"]')).toHaveLength(1);
      await create.trigger('click');
      expect(wrapper.emitted('new-conversation')).toEqual([[]]);
    } finally {
      wrapper.unmount();
    }
  });
});

describe('ConversationSidebar account menu', () => {
  async function openMenu(props = {}) {
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: { groups: [], activeConversationId: null, userName: 'Alice', ...props },
      global: { plugins: [i18n] },
    });
    await wrapper.get('[data-testid="shell-account-menu"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    return wrapper;
  }
  function item(id: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    expect(element, id).not.toBeNull();
    return element!;
  }

  it.each([
    ['cloud', true, 'shell-logout', 'Sign out'],
    ['guest', false, 'shell-open-cloud-connection', 'Connect cloud'],
    ['registered-local', false, 'shell-open-cloud-connection', 'Sign in again'],
  ] as const)(
    'shows the conditional action for %s and hides desktop actions on web',
    async (identityKind, cloudConnected, action, label) => {
      const wrapper = await openMenu({ identityKind, cloudConnected, isDesktop: false });
      try {
        expect(item('shell-account-identity').textContent?.match(/Alice/g)).toHaveLength(1);
        expect(item('shell-open-settings')).toBeTruthy();
        expect(item(action).textContent?.trim()).toBe(label);
        expect(document.querySelector('[data-testid="shell-switch-account"]')).toBeNull();
        expect(document.querySelector('[data-testid="shell-open-account"]')).toBeNull();
        expect(document.querySelector('[data-testid="shell-create-profile"]')).toBeNull();
        expect(document.querySelector('[data-testid="shell-logout"]') !== null).toBe(
          cloudConnected,
        );
      } finally {
        wrapper.unmount();
      }
    },
  );

  it('opens the flyout by keyboard, sorts exact IDs, bounds many profiles, and switches only on selection', async () => {
    const profiles = Array.from({ length: 30 }, (_, index) => ({
      profileId: `id-${index}`,
      displayName: 'Same very long name '.repeat(4),
      profileKind: index % 2 ? ('registered' as const) : ('guest' as const),
      avatarSeed: `${index}`,
      identifierHint: index % 2 ? `user-${index}@example.com` : null,
      cloudAccountId: index % 2 ? `cloud-${index}` : null,
      hasPin: index === 1,
      lastActiveAt: index,
    }));
    const wrapper = await openMenu({ isDesktop: true, profiles, activeProfileId: 'id-2' });
    try {
      item('shell-switch-account').focus();
      item('shell-switch-account').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushPromises();
      const rows = [...document.querySelectorAll('[data-testid^="shell-switch-profile-"]')];
      expect(rows).toHaveLength(30);
      expect(rows[0]?.getAttribute('data-testid')).toBe('shell-switch-profile-id-2');
      expect(rows[1]?.getAttribute('data-testid')).toBe('shell-switch-profile-id-29');
      expect(rows[0]?.getAttribute('aria-current')).toBe('true');
      expect(rows[0]?.getAttribute('aria-label')).toContain('Guest Profile');
      expect(rows[0]?.getAttribute('aria-label')).toContain('Current Profile');
      expect(item('shell-switch-profile-id-1').getAttribute('aria-label')).toContain(
        'Cloud connected',
      );
      expect(item('shell-switch-profile-id-1').getAttribute('aria-label')).toContain('Unlock');
      expect(item('shell-profile-list').classList.contains('overflow-y-auto')).toBe(true);
      expect(item('shell-switch-profile-id-1').querySelector('svg')).toBeTruthy();
      expect(wrapper.emitted('switch-profile')).toBeUndefined();
      expect(document.querySelector('[data-testid="shell-add-account"]')).toBeNull();
      item('shell-profile-switcher').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
      await flushPromises();
      expect(document.activeElement).toBe(item('shell-switch-account'));
      item('shell-switch-account').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      await flushPromises();
      item('shell-switch-profile-id-1').click();
      await flushPromises();
      expect(wrapper.emitted('switch-profile')).toEqual([['id-1']]);
    } finally {
      wrapper.unmount();
    }
  });

  it('supports touch/click opening and restores the footer trigger on Escape', async () => {
    const wrapper = await openMenu({ isDesktop: true });
    try {
      item('shell-switch-account').click();
      await flushPromises();
      expect(item('shell-manage-profiles')).toBeTruthy();
      item('shell-manage-profiles').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await flushPromises();
      // Focus restoration occurs after the nested menu's close-auto-focus
      // lifecycle; asserting synchronously races the portal unmount on CI.
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(
          wrapper.get('[data-testid="shell-account-menu"]').element,
        ),
      );
      expect(wrapper.emitted('switch-profile')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
});
