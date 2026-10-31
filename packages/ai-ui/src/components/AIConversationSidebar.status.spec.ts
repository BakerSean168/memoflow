import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import AIConversationSidebar from './AIConversationSidebar.vue';

vi.mock('@memoflow/ui-vue-shadcn', async () => {
  const vue = await import('vue');
  const pass = (name: string, tag = 'div') =>
    vue.defineComponent({
      name,
      inheritAttrs: false,
      setup(_, { slots, attrs }) {
        return () => vue.h(tag, attrs, slots.default?.());
      },
    });
  return {
    Button: pass('Button', 'button'),
    Collapsible: pass('Collapsible'),
    ContextMenu: pass('ContextMenu'),
    ContextMenuContent: pass('ContextMenuContent'),
    ContextMenuItem: pass('ContextMenuItem'),
    ContextMenuSeparator: pass('ContextMenuSeparator'),
    ContextMenuTrigger: pass('ContextMenuTrigger'),
    CollapsibleContent: pass('CollapsibleContent'),
    CollapsibleTrigger: pass('CollapsibleTrigger', 'button'),
    DropdownMenu: pass('DropdownMenu'),
    DropdownMenuContent: pass('DropdownMenuContent'),
    DropdownMenuItem: pass('DropdownMenuItem'),
    DropdownMenuTrigger: pass('DropdownMenuTrigger', 'button'),
    Tooltip: pass('Tooltip'),
    TooltipContent: pass('TooltipContent'),
    TooltipProvider: pass('TooltipProvider'),
    TooltipTrigger: pass('TooltipTrigger'),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: productionLocaleMessages,
});

const conversations = [
  {
    id: 'a',
    name: '这是一条特别特别长而且必须被正确截断的会话标题',
    runtimeKind: 'builtin',
  },
  { id: 'b', name: '普通已查看会话', runtimeKind: 'builtin' },
];

describe('AIConversationSidebar attention icons', () => {
  function mountSidebar(
    statuses: Record<string, 'approval' | 'failed' | 'input' | 'working' | 'done'>,
  ) {
    return mount(AIConversationSidebar, {
      props: {
        conversations: conversations as never,
        conversationStatuses: statuses,
        recentGoals: [],
        recentKnowledgeNotes: [],
        activeConversationId: 'a',
        loading: false,
      },
      global: { plugins: [i18n], stubs: { MemoFlowAiIcon: true } },
    });
  }

  it('keeps icons fixed on the right with localized accessible tooltips and truncates long titles', async () => {
    const wrapper = mountSidebar({ a: 'approval' });
    const row = wrapper.find('[data-testid="ai-sidebar-conversation-row"]');
    expect(row.exists()).toBe(true);
    expect(row.find('span.truncate').exists()).toBe(true);
    expect(row.find('button.pr-24').exists()).toBe(true);
    const status = row.find('[data-testid="ai-sidebar-conversation-status"]');
    expect(status.exists()).toBe(true);
    expect(status.attributes('aria-label')).toBe('等待审批');
    expect(status.classes()).toContain('right-2');
    expect(status.find('svg').classes()).toContain('text-[#FBBF24]');
    expect(row.text()).toContain('等待审批');
    expect(wrapper.findAll('[data-testid="ai-sidebar-conversation-status"]')).toHaveLength(1);
    await status.trigger('click');
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: 'a' });
    wrapper.unmount();
  });

  it('does not show any status marker for ordinary or already-viewed conversations', () => {
    const wrapper = mountSidebar({});
    expect(wrapper.findAll('[data-testid="ai-sidebar-conversation-status"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="ai-sidebar-conversation-row"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it.each([
    ['failed', '执行失败', 'text-[#F87171]'],
    ['input', '等待回答', 'text-[#A5B4FC]'],
    ['working', '正在执行', 'text-[#7DD3FC]'],
    ['done', '有新结果', 'text-[#6EE7B7]'],
  ] as const)('renders %s with one icon and the correct semantic color', (state, label, color) => {
    const wrapper = mountSidebar({ a: state });
    const status = wrapper.find('[data-testid="ai-sidebar-conversation-status"]');
    expect(status.attributes('aria-label')).toBe(label);
    expect(status.find('svg').classes()).toContain(color);
    wrapper.unmount();
  });
});
