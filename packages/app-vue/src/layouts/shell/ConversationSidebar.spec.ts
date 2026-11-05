import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { Toaster, toast } from 'vue-sonner';
import ConversationSidebar from './ConversationSidebar.vue';
import { listAdapterFor } from '../../shared/keyboard/list-adapter';
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
          noArchivedConversations: 'No archived conversations yet',
          active: 'Active',
          archive: 'Archive',
          restore: 'Restore',
          previousPage: 'Previous page',
          nextPage: 'Next page',
          select: 'Select conversations',
          selectedCount: '{count} selected',
          rename: 'Rename',
          regenerateTitle: 'Regenerate title',
          generatingTitle: 'Generating title…',
          delete: 'Delete',
          bulkSucceeded: '{action} completed · {count}',
          bulkFailed: '{action} failed · {count}',
          retry: 'Retry',
        },
        account: {
          menu: 'Account menu',
          signedIn: 'Signed in',
          localProfile: 'Local Profile',
          localIdentity: 'Local account',
          accountAndPrivacy: 'Account & privacy',
          settings: 'Settings',
          logout: 'Sign out',
          connectCloud: 'Connect cloud',
          reauthenticate: 'Sign in again',
          switchAccount: 'Switch account',
          menuAddAccount: 'Add account',
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

/** 右键菜单内容渲染在 body 的 portal 里（reka ContextMenu）。 */
async function openRowMenu(wrapper: ReturnType<typeof mount>, id: string) {
  await wrapper.get(`[data-keyboard-item="${id}"]`).trigger('contextmenu');
  await flushPromises();
}
function menuItem(testId: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}
async function selectMenuItem(testId: string) {
  const item = menuItem(testId);
  if (!item) throw new Error(`menu item ${testId} not rendered`);
  item.click();
  await flushPromises();
}

/** 等 sonner 完成一次渲染/退场动画调度。 */
async function settleToast() {
  await flushPromises();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await flushPromises();
}
function toastElement(type: 'success' | 'error'): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-sonner-toast][data-type="${type}"]`);
}
/** 列表流/侧栏根节点的子节点结构，用于断言结果反馈没有插入流内元素。 */
function sidebarLayout(sidebar: Element): string[] {
  return [...sidebar.children].map((child) => child.getAttribute('data-testid') ?? child.tagName);
}

// sonner 的 toast 队列是模块级单例，测试之间必须清掉，否则会串到下一个用例。
afterEach(() => {
  toast.dismiss();
  document.body.innerHTML = '';
});

describe('ConversationSidebar attention', () => {
  it('archives without confirmation and guards pending rows', async () => {
    const originalConfirm = window.confirm;
    const confirm = vi.fn();
    window.confirm = confirm;
    const wrapper = mount(ConversationSidebar, {
      props: {
        groups,
        activeConversationId: 'b',
        conversationStatuses: { a: 'working' },
      },
      global: { plugins: [i18n] },
    });
    try {
      const rows = wrapper.findAll('[data-testid="conversation-row"]');
      // 运行中的会话不出现归档主操作，保留状态图标（T3 同款单槽位）。
      expect(rows[0]!.find('[data-testid="conversation-archive"]').exists()).toBe(false);
      expect(rows[0]!.find('[data-testid="shell-conversation-status"]').exists()).toBe(true);
      const archive = rows[1]!.get('[data-testid="conversation-archive"]');
      expect(archive.classes()).toEqual(
        expect.arrayContaining([
          'opacity-0',
          'pointer-events-none',
          'group-any-hover/item:opacity-100',
          'group-any-hover/item:pointer-events-auto',
          'focus-visible:opacity-100',
        ]),
      );
      expect(archive.attributes('aria-label')).toBe('Archive');
      await archive.trigger('click');
      expect(wrapper.emitted('archive-conversation')).toEqual([['b']]);
      expect(wrapper.emitted('select-conversation')).toBeUndefined();
      expect(confirm).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="conversation-archive-toggle"]').exists()).toBe(false);
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
    expect(firstRow?.classes()).toContain('pr-9');
    expect(firstRow?.find('span').classes()).toContain('truncate');
    const normalRow = wrapper.findAll('nav button').find((item) => item.text() === 'Training plan');
    expect(normalRow?.classes()).toContain('pr-9');
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
describe('ConversationSidebar mouse and batch selection', () => {
  it('selects contiguous and disjoint rows without opening, prunes filters, and resets Profile', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: null, activeProfileId: 'one' },
      global: { plugins: [i18n] },
    });
    const row = (id: string) => wrapper.get(`[data-keyboard-item="${id}"]`);
    await row('a').trigger('click');
    await row('c').trigger('click', { shiftKey: true });
    expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(3);
    expect(wrapper.emitted('select-conversation')).toEqual([['a']]);
    await row('b').trigger('click', { ctrlKey: true });
    expect(row('b').attributes('aria-selected')).toBe('false');
    await wrapper.get('[data-testid="conversation-search-toggle"]').trigger('click');
    await wrapper.get('[data-testid="conversation-search-input"]').setValue('Infrastructure');
    expect(wrapper.get('[data-testid="conversation-selection-count"]').text()).toBe('1 selected');
    await wrapper.setProps({ activeProfileId: 'two' });
    expect(row('c').attributes('aria-selected')).toBe('false');
    wrapper.unmount();
  });
  it('anchors keyboard range selection at the row reached by focus navigation', async () => {
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: { groups, activeConversationId: null },
      global: { plugins: [i18n] },
    });
    try {
      await wrapper.get('[data-keyboard-item="a"]').trigger('click');
      const adapter = listAdapterFor(wrapper.get('[data-keyboard-item="a"]').element)!;
      adapter.moveSelection(1);
      adapter.moveSelection(1, true);
      await flushPromises();
      expect(wrapper.get('[data-keyboard-item="a"]').attributes('aria-selected')).toBe('false');
      expect(wrapper.get('[data-keyboard-item="b"]').attributes('aria-selected')).toBe('true');
      expect(wrapper.get('[data-keyboard-item="c"]').attributes('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(wrapper.get('[data-keyboard-item="c"]').element);
      await wrapper
        .get('[data-testid="conversation-sidebar"]')
        .trigger('keydown', { key: 'Escape' });
      const afterClear = listAdapterFor(wrapper.get('[data-keyboard-item="c"]').element)!;
      afterClear.moveSelection(-1, true);
      await flushPromises();
      expect(wrapper.get('[data-keyboard-item="c"]').attributes('aria-selected')).toBe('true');
    } finally {
      wrapper.unmount();
    }
  });
  it.each([{ ids: ['a'] }, { ids: ['a', 'b'] }])(
    'removes deleted rows and reports success only as a transient toast ($ids)',
    async ({ ids }) => {
      const toaster = mount(Toaster, { attachTo: document.body });
      const bulkAction = vi.fn(async (_action: string, selected: string[]) => {
        await wrapper.setProps({
          groups: groups.map((group) => ({
            ...group,
            items: group.items.filter((item) => !selected.includes(item.id)),
          })),
        });
        return selected.map((id) => ({ id, success: true }));
      });
      const wrapper = mount(ConversationSidebar, {
        attachTo: document.body,
        props: { groups, activeConversationId: null, bulkAction },
        global: { plugins: [i18n] },
      });
      try {
        for (const id of ids)
          await wrapper.get(`[data-keyboard-item="${id}"]`).trigger('click', { ctrlKey: true });
        await openRowMenu(wrapper, ids[0]!);
        await selectMenuItem('conversation-context-delete');
        expect(bulkAction).toHaveBeenCalledWith('delete', ids);
        for (const id of ids)
          expect(wrapper.find(`[data-keyboard-item="${id}"]`).exists()).toBe(false);
        expect(wrapper.find('[data-testid="conversation-bulk-results"]').exists()).toBe(false);
        await settleToast();
        expect(toastElement('success')?.textContent).toContain(`Delete completed · ${ids.length}`);
      } finally {
        wrapper.unmount();
        toaster.unmount();
      }
    },
  );
  it('reports each result, retains failed selection, and ignores stale Profile completions', async () => {
    let finish!: (value: { id: string; success: boolean }[]) => void;
    const bulkAction = vi.fn(
      () =>
        new Promise<{ id: string; success: boolean }[]>((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: {
        groups,
        activeConversationId: null,
        activeProfileId: 'one',
        bulkAction,
      },
      global: { plugins: [i18n] },
    });
    await wrapper.get('[data-keyboard-item="a"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-keyboard-item="c"]').trigger('click', { shiftKey: true });
    await openRowMenu(wrapper, 'b');
    expect(menuItem('conversation-context-status')?.textContent).toContain('Archive (3)');
    await selectMenuItem('conversation-context-status');
    await openRowMenu(wrapper, 'b');
    expect(menuItem('conversation-context-status')?.hasAttribute('data-disabled')).toBe(true);
    menuItem('conversation-context-status')?.click();
    await flushPromises();
    expect(bulkAction).toHaveBeenCalledTimes(1);
    finish([
      { id: 'a', success: true },
      { id: 'b', success: false },
      { id: 'c', success: true },
    ]);
    await flushPromises();
    expect(wrapper.get('[data-testid="conversation-selection-count"]').text()).toBe('1 selected');
    // #831：批量结果不再渲染成列表顶部的常驻行，失败会话只保留选中。
    expect(wrapper.find('[data-testid="conversation-bulk-results"]').exists()).toBe(false);
    expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(1);
    await document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    await openRowMenu(wrapper, 'b');
    await selectMenuItem('conversation-context-status');
    await wrapper.setProps({ activeProfileId: 'two' });
    finish([{ id: 'b', success: false }]);
    await flushPromises();
    expect(wrapper.find('[data-testid="conversation-bulk-results"]').exists()).toBe(false);
    expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(0);
    wrapper.unmount();
  });
  /**
   * #831：批量结果改为全局浮层 toast。列表流内不留常驻行，失败提示带真重试，
   * 提示出现前后侧栏结构与行顺序保持不变，证明反馈不占列表布局。
   */
  it('reports bulk results as an overlay toast with a real retry and no list-flow change', async () => {
    const toaster = mount(Toaster, { attachTo: document.body });
    let attempts = 0;
    const bulkAction = vi.fn(async (_action: string, selected: string[]) => {
      attempts += 1;
      // 首次失败走 catch 分支（模拟离线写入），重试成功。
      if (attempts === 1) throw new Error('Simulated offline write');
      return selected.map((id) => ({ id, success: true }));
    });
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: { groups, activeConversationId: null, bulkAction },
      global: { plugins: [i18n] },
    });
    try {
      const sidebar = wrapper.get('[data-testid="conversation-sidebar"]').element;
      const layoutBefore = sidebarLayout(sidebar);
      const rowsBefore = wrapper
        .findAll('[data-keyboard-item]')
        .map((row) => row.attributes('data-keyboard-item'));

      for (const id of ['a', 'b', 'c'])
        await wrapper.get(`[data-keyboard-item="${id}"]`).trigger('click', { ctrlKey: true });
      await openRowMenu(wrapper, 'b');
      await selectMenuItem('conversation-context-status');
      expect(bulkAction).toHaveBeenCalledWith('archive', ['a', 'b', 'c']);
      await settleToast();

      // 反馈只在 body 的浮层里，侧栏与列表流结构、行顺序不变。
      expect(sidebarLayout(sidebar)).toEqual(layoutBefore);
      expect(
        wrapper.findAll('[data-keyboard-item]').map((row) => row.attributes('data-keyboard-item')),
      ).toEqual(rowsBefore);
      expect(wrapper.find('[data-testid="conversation-bulk-results"]').exists()).toBe(false);
      const toasterEl = document.body.querySelector('[data-sonner-toaster]');
      expect(toasterEl).not.toBeNull();
      expect(sidebar.contains(toasterEl!)).toBe(false);

      const failure = toastElement('error');
      expect(failure?.textContent).toContain('Archive failed · 3');
      const retry = failure?.querySelector<HTMLButtonElement>('[data-button][data-action]');
      expect(retry?.textContent).toBe('Retry');

      retry!.click();
      await settleToast();
      // 真重试：同一动作、同一批失败 ids 再次执行。
      expect(bulkAction).toHaveBeenCalledTimes(2);
      expect(bulkAction).toHaveBeenLastCalledWith('archive', ['a', 'b', 'c']);
      // 点击后旧提示进入退场（jsdom 不跑动画，只能断言已标记移除）。
      expect(toastElement('error')?.getAttribute('data-removed')).toBe('true');
      // 归档成功由会话层带 Undo 的既有 toast 负责，侧栏不再叠一条重复成功提示。
      expect(toastElement('success')).toBeNull();
      expect(wrapper.find('[data-testid="conversation-bulk-results"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      toaster.unmount();
    }
  });
});
describe('ConversationSidebar compact toolbar', () => {
  it('selects visible conversations and clears only acknowledged bulk successes', async () => {
    const bulkAction = vi.fn(async (_action: string, ids: string[]) =>
      ids.map((id) => ({ id, success: true })),
    );
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: { groups, activeConversationId: null, bulkAction },
      global: { plugins: [i18n] },
    });
    try {
      // 没有“选择模式”入口、复选框和常驻批量工具栏（T3 Code 同款）。
      expect(wrapper.find('[data-testid="conversation-select-toggle"]').exists()).toBe(false);
      expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
      await wrapper.get('[data-keyboard-item="a"]').trigger('click', { metaKey: true });
      await wrapper.get('[data-keyboard-item="c"]').trigger('click', { shiftKey: true });
      expect(wrapper.get('[data-testid="conversation-selection-count"]').text()).toBe('3 selected');
      expect(wrapper.emitted('select-conversation')).toBeUndefined();
      await openRowMenu(wrapper, 'a');
      expect(menuItem('conversation-context-rename')).toBeNull();
      expect(menuItem('conversation-context-delete')?.textContent).toContain('Delete (3)');
      await selectMenuItem('conversation-context-status');
      expect(bulkAction).toHaveBeenCalledWith('archive', ['a', 'b', 'c']);
      expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(0);
      expect(wrapper.find('[data-testid="conversation-selection-toolbar"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
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
      props: {
        groups: [],
        activeConversationId: null,
        userName: 'Alice',
        ...props,
      },
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
    ['local', false, 'shell-open-cloud-connection', 'Connect cloud'],
    ['registered-local', false, 'shell-open-cloud-connection', 'Sign in again'],
  ] as const)(
    'shows the conditional action for %s and hides desktop actions on web',
    async (identityKind, cloudConnected, action, label) => {
      const wrapper = await openMenu({
        identityKind,
        cloudConnected,
        isDesktop: false,
      });
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

  it.each([
    ['local', false],
    ['registered-local', false],
    ['cloud', true],
  ] as const)(
    'offers desktop sign out and login entry for %s',
    async (identityKind, cloudConnected) => {
      const wrapper = await openMenu({
        isDesktop: true,
        identityKind,
        cloudConnected,
      });
      try {
        expect(document.querySelector('[data-testid="shell-open-cloud-connection"]')).toBeNull();
        item('shell-logout').click();
        await flushPromises();
        expect(wrapper.emitted('logout')).toEqual([[]]);
        await wrapper
          .get('[data-testid="shell-account-menu"]')
          .trigger('keydown', { key: 'Enter' });
        await flushPromises();
        item('shell-switch-account').click();
        await flushPromises();
        expect(document.querySelector('[data-testid="shell-manage-profiles"]')).toBeNull();
        item('shell-add-account').click();
        await flushPromises();
        expect(wrapper.emitted('add-account')).toEqual([[]]);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it('opens the flyout by keyboard, sorts exact IDs, bounds many profiles, and switches only on selection', async () => {
    const profiles = Array.from({ length: 30 }, (_, index) => ({
      profileId: `id-${index}`,
      displayName: 'Same very long name '.repeat(4),
      profileKind: index % 2 ? ('registered' as const) : ('local' as const),
      avatarSeed: `${index}`,
      identifierHint: index % 2 ? `user-${index}@example.com` : null,
      cloudAccountId: index % 2 ? `cloud-${index}` : null,
      hasCredential: index === 1,
      remembered: false,
      lastActiveAt: index,
    }));
    const wrapper = await openMenu({
      isDesktop: true,
      profiles,
      activeProfileId: 'id-2',
    });
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
      expect(rows[0]?.getAttribute('aria-label')).toContain('Local account');
      expect(rows[0]?.getAttribute('aria-label')).toContain('Current Profile');
      expect(item('shell-switch-profile-id-1').getAttribute('aria-label')).toContain(
        'Cloud connected',
      );
      expect(item('shell-switch-profile-id-1').getAttribute('aria-label')).toContain('Unlock');
      expect(item('shell-profile-list').classList.contains('overflow-y-auto')).toBe(true);
      expect(item('shell-switch-profile-id-1').querySelector('svg')).toBeTruthy();
      expect(wrapper.emitted('switch-profile')).toBeUndefined();
      expect(item('shell-add-account').textContent).toContain('Add account');
      expect(document.querySelector('[data-testid="shell-manage-profiles"]')).toBeNull();
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
      expect(item('shell-add-account')).toBeTruthy();
      item('shell-add-account').dispatchEvent(
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

describe('conversation title editing', () => {
  it('supports double-click, Enter save, Escape cancel and pending regeneration controls', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: 'a', titleBusy: { a: true } },
      global: { plugins: [i18n] },
    });
    await wrapper.get('[data-keyboard-item="a"]').trigger('dblclick');
    const input = wrapper.get('[data-testid="conversation-title-input"]');
    await input.setValue('Edited title');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('rename-conversation')).toEqual([['a', 'Edited title']]);
    await wrapper.get('[data-keyboard-item="b"]').trigger('dblclick');
    await wrapper.get('[data-testid="conversation-title-input"]').setValue('Cancelled');
    await wrapper
      .get('[data-testid="conversation-title-input"]')
      .trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="conversation-title-input"]').exists()).toBe(false);
    expect(wrapper.emitted('rename-conversation')).toHaveLength(1);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('ConversationSidebar archived partition', () => {
  const archived = [{ id: 'z', title: 'Old architecture notes', time: '2 days ago' }];

  it('shows archived conversations in their own collapsed partition and restores them', async () => {
    const bulkAction = vi.fn(async (_action: string, ids: string[]) =>
      ids.map((id) => ({ id, success: true })),
    );
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: 'b', archivedConversations: archived, bulkAction },
      global: { plugins: [i18n] },
    });
    try {
      const section = wrapper.get('[data-testid="conversation-archived-section"]');
      expect(section.text()).toContain('Archived');
      expect(section.get('[data-testid="conversation-archived-count"]').text()).toBe('1');
      const toggle = section.get('[data-testid="conversation-archived-toggle"]');
      expect(toggle.attributes('aria-expanded')).toBe('false');
      expect(toggle.attributes('aria-controls')).toBe('conversation-archived-list');
      expect(wrapper.find('[data-testid="archived-conversation-row"]').exists()).toBe(false);

      await toggle.trigger('click');
      expect(toggle.attributes('aria-expanded')).toBe('true');
      const row = wrapper.get('[data-testid="archived-conversation-row"]');
      expect(row.text()).toContain('Old architecture notes');
      expect(row.get('[data-testid="archived-conversation-time"]').text()).toBe('2 days ago');
      // 归档行不属于主列表的选择集合，恢复是唯一入口。
      expect(row.find('[role="option"]').exists()).toBe(false);

      await row.get('[data-testid="archived-conversation-restore"]').trigger('click');
      // 恢复也走批量结果通路（#831 的 toast/重试），不再单独发 restore-conversation。
      expect(bulkAction).toHaveBeenCalledWith('restore', ['z']);
      expect(wrapper.emitted('restore-conversation')).toBeUndefined();
      expect(wrapper.emitted('select-conversation')).toBeUndefined();

      // 父级恢复后：分区消失，会话回到普通列表分组。
      await wrapper.setProps({
        archivedConversations: [],
        groups: [
          ...groups,
          {
            labelKey: 'shell.conversation.earlier',
            items: [{ id: 'z', title: 'Old architecture notes' }],
          },
        ],
      });
      expect(wrapper.find('[data-testid="archived-conversation-row"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="conversation-archived-count"]').text()).toBe('0');
      expect(wrapper.find('[data-keyboard-item="z"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="conversation-archive-toggle"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps the partition with an empty state when nothing is archived', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: { groups, activeConversationId: null },
      global: { plugins: [i18n] },
    });
    try {
      const section = wrapper.get('[data-testid="conversation-archived-section"]');
      expect(section.get('[data-testid="conversation-archived-count"]').text()).toBe('0');
      await section.get('[data-testid="conversation-archived-toggle"]').trigger('click');
      expect(wrapper.get('[data-testid="conversation-archived-empty"]').text()).toBe(
        'No archived conversations yet',
      );
      expect(wrapper.find('[data-testid="archived-conversation-row"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it('pages the archived projection while expanded', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: {
        groups,
        activeConversationId: null,
        archivedConversations: archived,
        archivePage: 2,
        archiveHasMore: true,
      },
      global: { plugins: [i18n] },
    });
    try {
      await wrapper.get('[data-testid="conversation-archived-toggle"]').trigger('click');
      const previous = wrapper.get('[data-testid="archived-conversation-previous-page"]');
      const next = wrapper.get('[data-testid="archived-conversation-next-page"]');
      expect(previous.attributes('disabled')).toBeUndefined();
      expect(next.attributes('disabled')).toBeUndefined();
      await previous.trigger('click');
      await next.trigger('click');
      expect(wrapper.emitted('change-archive-page')).toEqual([[-1], [1]]);

      await wrapper.setProps({ archivePage: 1, archiveHasMore: false, loading: true });
      expect(
        wrapper.get('[data-testid="archived-conversation-previous-page"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        wrapper.get('[data-testid="archived-conversation-next-page"]').attributes('disabled'),
      ).toBeDefined();
    } finally {
      wrapper.unmount();
    }
  });
});

describe('ConversationSidebar T3 Code row interactions', () => {
  it('opens a single-row context menu without counts and archives through the bulk path', async () => {
    const bulkAction = vi.fn(async (_action: string, ids: string[]) =>
      ids.map((id) => ({ id, success: true })),
    );
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: {
        groups,
        activeConversationId: 'b',
        conversationStatuses: { a: 'working' },
        bulkAction,
      },
      global: { plugins: [i18n] },
    });
    try {
      await openRowMenu(wrapper, 'b');
      expect(menuItem('conversation-context-rename')?.textContent).toContain('Rename');
      expect(menuItem('conversation-context-regenerate')).not.toBeNull();
      expect(menuItem('conversation-context-status')?.textContent?.trim()).toBe('Archive');
      await selectMenuItem('conversation-context-status');
      expect(bulkAction).toHaveBeenCalledWith('archive', ['b']);
      await openRowMenu(wrapper, 'a');
      expect(menuItem('conversation-context-status')?.hasAttribute('data-disabled')).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it('renames with F2 and opens the menu from the ContextMenu key', async () => {
    const wrapper = mount(ConversationSidebar, {
      attachTo: document.body,
      props: { groups, activeConversationId: 'a' },
      global: { plugins: [i18n] },
    });
    try {
      await wrapper.get('[data-keyboard-item="b"]').trigger('keydown', { key: 'F2' });
      await flushPromises();
      expect(wrapper.find('[data-testid="conversation-title-input"]').exists()).toBe(true);
      await wrapper
        .get('[data-testid="conversation-title-input"]')
        .trigger('keydown', { key: 'Escape' });
      // 浏览器在 ContextMenu 键 / Shift+F10 后会在聚焦元素上派发原生 contextmenu。
      const row = wrapper.get('[data-keyboard-item="c"]');
      await row.trigger('keydown', { key: 'F10', shiftKey: true });
      await row.trigger('contextmenu');
      await flushPromises();
      expect(menuItem('conversation-context-status')).not.toBeNull();
    } finally {
      wrapper.unmount();
    }
  });
});
