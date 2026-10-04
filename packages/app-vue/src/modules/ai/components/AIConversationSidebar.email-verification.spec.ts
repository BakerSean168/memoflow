/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import AIConversationSidebar from './AIConversationSidebar.vue';

vi.mock('@memoflow/ui-vue-shadcn', async () => {
  const vue = await import('vue');
  const passthrough = (name: string) =>
    vue.defineComponent({
      name,
      inheritAttrs: false,
      setup(_, { slots, attrs }) {
        return () => vue.h('div', attrs, slots.default?.());
      },
    });
  return {
    Button: passthrough('ButtonStub'),
    Collapsible: passthrough('CollapsibleStub'),
    CollapsibleContent: passthrough('CollapsibleContentStub'),
    CollapsibleTrigger: passthrough('CollapsibleTriggerStub'),
    DropdownMenu: passthrough('DropdownMenuStub'),
    DropdownMenuContent: passthrough('DropdownMenuContentStub'),
    DropdownMenuItem: passthrough('DropdownMenuItemStub'),
    DropdownMenuTrigger: passthrough('DropdownMenuTriggerStub'),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

describe('AIConversationSidebar email verification degrade', () => {
  it('shows verification-required copy instead of silent no-notes empty state', () => {
    const wrapper = mount(AIConversationSidebar, {
      props: {
        conversations: [],
        recentGoals: [],
        recentKnowledgeNotes: [],
        recentKnowledgeNotesEmailVerificationRequired: true,
        recentKnowledgeNotesErrorMessageKey: 'errors.EMAIL_VERIFICATION_REQUIRED',
        activeConversationId: '',
        loading: false,
      },
      global: {
        plugins: [i18n],
        stubs: {
          ChevronDown: true,
          FileText: true,
          Bot: true,
          MemoFlowAiIcon: true,
          MessageSquare: true,
          MoreHorizontal: true,
          Plus: true,
          RefreshCcw: true,
          Settings2: true,
          Target: true,
          Trash2: true,
          X: true,
        },
      },
    });

    // Open recent notes section content is always in DOM via Collapsible stubs
    const degrade = wrapper.find('[data-testid="ai-sidebar-email-verification"]');
    expect(degrade.exists()).toBe(true);
    expect(degrade.attributes('role')).toBe('status');
    expect(degrade.classes()).toEqual(expect.arrayContaining(['bg-warning/8', 'text-foreground']));
    expect(degrade.html()).not.toMatch(/(?:amber|yellow)-\d+/);
    expect(wrapper.find('[data-testid="ai-sidebar-no-recent-notes"]').exists()).toBe(false);

    const text = degrade.text();
    expect(text).not.toMatch(/errors\.EMAIL_VERIFICATION|noRecentKnowledgeNotes/);
    expect(text).toContain(productionLocaleMessages['en-US'].errors.EMAIL_VERIFICATION_REQUIRED);
    expect(text).toContain(productionLocaleMessages['en-US'].common.emailVerificationRequiredHint);

    wrapper.unmount();
  });
});
