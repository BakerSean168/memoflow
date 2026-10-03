import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ConversationSidebar from './ConversationSidebar.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { loading: 'Loading', more: 'More', delete: 'Delete' },
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

describe('ConversationSidebar search', () => {
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

    await wrapper.get('[data-testid="conversation-search-clear"]').trigger('click');
    expect(wrapper.text()).toContain('Personal systems architecture');
    expect(wrapper.text()).toContain('Infrastructure migration');
  });
});
