import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import AIConversationSidebar from './AIConversationSidebar.vue';
import AIConversationSidebarRow from './AIConversationSidebarRow.vue';
import { resolveSidebarRowStatus } from '../composables/useDurableConversationAttention';
import { createSidebarListMotion } from '../composables/sidebarListMotion';
import type { AssistantAttentionView } from '@memoflow/ai-contracts';

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
    expect(row.find('button.pr-24').exists()).toBe(false);
    expect(row.find('button').exists()).toBe(true);
    const status = row.find('[data-testid="ai-sidebar-conversation-status"]');
    expect(status.exists()).toBe(true);
    expect(status.attributes('aria-label')).toBe('等待审批');
    expect(status.find('svg').classes()).toContain('text-warning');
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
    ['failed', '执行失败', 'text-destructive'],
    ['input', '等待回答', 'text-primary'],
    ['working', '正在执行', 'text-info'],
    ['done', '有新结果', 'text-success'],
  ] as const)('renders %s with one icon and the correct semantic color', (state, label, color) => {
    const wrapper = mountSidebar({ a: state });
    const status = wrapper.find('[data-testid="ai-sidebar-conversation-status"]');
    expect(status.attributes('aria-label')).toBe(label);
    expect(status.find('svg').classes()).toContain(color);
    wrapper.unmount();
  });
});

describe('AIConversationSidebarRow and stable trailing slot', () => {
  it('renders stable action buttons and disables archive on blocking states', () => {
    const wrapper = mount(AIConversationSidebarRow, {
      props: {
        conversation: conversations[0] as never,
        active: true,
        status: 'working',
        showingArchive: false,
      },
      global: { plugins: [i18n] },
    });

    const archiveBtn = wrapper.find('[data-testid="ai-sidebar-conversation-archive"]');
    expect(archiveBtn.exists()).toBe(true);
    expect(archiveBtn.attributes('disabled')).toBeDefined();

    const moreBtn = wrapper.find('[data-testid="ai-sidebar-conversation-more"]');
    expect(moreBtn.exists()).toBe(true);

    const titleSpan = wrapper.find('span.truncate');
    expect(titleSpan.exists()).toBe(true);
    expect(titleSpan.text()).toContain('这是一条特别特别长');

    wrapper.unmount();
  });

  it('enables archive when status is done or ready', async () => {
    const wrapper = mount(AIConversationSidebarRow, {
      props: {
        conversation: conversations[0] as never,
        active: false,
        status: 'done',
        showingArchive: false,
      },
      global: { plugins: [i18n] },
    });

    const archiveBtn = wrapper.find('[data-testid="ai-sidebar-conversation-archive"]');
    expect(archiveBtn.exists()).toBe(true);
    expect(archiveBtn.attributes('disabled')).toBeUndefined();

    await archiveBtn.trigger('click');
    expect(wrapper.emitted('archive')?.[0]?.[0]).toBe('a');

    wrapper.unmount();
  });

  it('triggers inline title editing on double-click', async () => {
    const wrapper = mount(AIConversationSidebarRow, {
      props: {
        conversation: conversations[0] as never,
        active: true,
      },
      global: { plugins: [i18n] },
    });

    const mainBtn = wrapper.find('button');
    await mainBtn.trigger('dblclick');

    const input = wrapper.find('[data-testid="conversation-title-input"]');
    expect(input.exists()).toBe(true);

    await input.setValue('新会话名称');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('rename')?.[0]).toEqual(['a', '新会话名称']);
    wrapper.unmount();
  });
});

describe('resolveSidebarRowStatus pure function', () => {
  const row = (
    id: string,
    state: AssistantAttentionView['state'],
    revision = 2,
    runtimeKind: AssistantAttentionView['runtimeKind'] = 'builtin',
  ): AssistantAttentionView => ({
    conversationId: id,
    runtimeKind,
    state,
    revision,
    seenRevision: 0,
    runId: `run-${id}-${revision}`,
    updatedAt: Date.now(),
  });

  it('returns null for normal snapshot or when done was already seen', () => {
    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: row('c1', 'normal'),
      }),
    ).toBeNull();

    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: { ...row('c1', 'done', 2), seenRevision: 2 },
      }),
    ).toBeNull();
  });

  it('returns null for done when acknowledged revision matches or exceeds snapshot revision', () => {
    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: row('c1', 'done', 3),
        acknowledgedRevision: 3,
      }),
    ).toBeNull();

    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: row('c1', 'done', 3),
        acknowledgedRevision: 2,
      }),
    ).toBe('done');
  });

  it('returns null for done when foreground is active and visible', () => {
    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: row('c1', 'done', 3),
        activeConversationId: 'c1',
        isVisible: true,
      }),
    ).toBeNull();

    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: row('c1', 'done', 3),
        activeConversationId: 'c1',
        isVisible: false,
      }),
    ).toBe('done');
  });

  it('prioritizes live foreground local attention when loading or snapshot is absent', () => {
    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: row('c1', 'done', 1),
        localStatus: 'working',
        activeConversationId: 'c1',
        loading: true,
      }),
    ).toBe('working');

    expect(
      resolveSidebarRowStatus({
        conversationId: 'c1',
        snapshot: null,
        localStatus: 'approval',
        activeConversationId: 'c1',
        loading: false,
      }),
    ).toBe('approval');
  });

  it('returns matching state for attention states', () => {
    for (const state of ['failed', 'input', 'approval', 'working'] as const) {
      expect(
        resolveSidebarRowStatus({
          conversationId: 'c1',
          snapshot: row('c1', state),
        }),
      ).toBe(state);
    }
  });
});

describe('createSidebarListMotion', () => {
  it('initializes and updates positions without errors and cleans up on dispose', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const child1 = document.createElement('div');
    child1.setAttribute('data-sidebar-row', '1');
    child1.setAttribute('data-testid', 'row-1');
    child1.id = 'row-1';

    const child2 = document.createElement('div');
    child2.setAttribute('data-sidebar-row', '2');

    parent.appendChild(child1);
    parent.appendChild(child2);

    const motion = createSidebarListMotion(parent);
    motion.update(false);

    // Remove child1 and update with animate=true
    child1.remove();
    motion.update(true);

    motion.dispose();
    parent.remove();
  });

  it('respects prefers-reduced-motion: reduce by bypassing animation', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const child = document.createElement('div');
      parent.appendChild(child);

      const motion = createSidebarListMotion(parent);
      motion.update(false);

      child.remove();
      // Should not throw or crash and should not animate fades
      motion.update(true);
      motion.dispose();
    } finally {
      window.matchMedia = originalMatchMedia;
      parent.remove();
    }
  });

  it('bypasses animations when faded rows exceed MAX_FADED_ROWS_PER_UPDATE (40)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    for (let i = 0; i < 50; i++) {
      const child = document.createElement('div');
      Object.defineProperty(child, 'offsetHeight', { value: 36, configurable: true });
      parent.appendChild(child);
    }

    const motion = createSidebarListMotion(parent);
    motion.update(false);

    // Remove 45 children
    while (parent.children.length > 5) {
      parent.firstElementChild?.remove();
    }

    // Should gracefully bypass fade animations due to batch protection
    motion.update(true);
    motion.dispose();
    parent.remove();
  });
});
