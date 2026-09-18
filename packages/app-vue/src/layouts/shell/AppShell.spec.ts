/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { computed, defineComponent, h, inject, nextTick, onMounted, ref, Teleport } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELL_WORKFLOW_MOUNT_KEY } from '../../di/keys';
import AppShell from './AppShell.vue';
import BusinessPanel from './BusinessPanel.vue';
import { useAppShellStore } from './useAppShellStore';

vi.mock('../../modules/notification/composables/useNotificationUnreadQuery', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useNotificationUnreadQuery: () => ({
      unreadCount: vueRef(0),
      hasUnread: vueRef(false),
      refetch: vi.fn(async () => undefined),
    }),
  };
});

vi.mock('../../modules/schedule/composables/useCalendarView', () => ({
  formatScheduleCapsuleLabel: () => '',
  useCalendarView: () => ({
    getScheduleCapsuleSnapshot: () => null,
    ensureTodayLoaded: vi.fn(async () => undefined),
  }),
}));

vi.mock('../../modules/authentication/composables/useAuth', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useAuth: () => ({
      isAuthenticated: vueRef(false),
      logout: vi.fn(async () => undefined),
    }),
  };
});

vi.mock('../../shared/composables/useDesktopWindowControls', () => ({
  useDesktopWindowControls: () => ({
    windowControlsState: { isMaximized: false },
    startListening: vi.fn(),
    stopListening: vi.fn(),
    minimizeWindow: vi.fn(),
    toggleMaximize: vi.fn(),
    closeWindow: vi.fn(),
  }),
}));

vi.mock('../../shared/utils/desktop-auth-recovery', () => ({
  hasDesktopAuthApi: () => false,
}));

const passThrough = (name: string) =>
  defineComponent({
    name,
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });

const activeChatConversationId = ref<string | null>(null);

const AIChatViewStub = defineComponent({
  name: 'AIChatView',
  setup(_props, { expose }) {
    const workflowMount = inject(SHELL_WORKFLOW_MOUNT_KEY)!;
    const target = computed(() => workflowMount.value);
    expose({
      conversationList: [],
      conversationListLoading: false,
      chatConversationId: activeChatConversationId,
    });

    return () =>
      h('div', { 'data-testid': 'ai-chat-view' }, [
        target.value
          ? h(
              Teleport,
              { to: target.value },
              h('div', { 'data-testid': 'workflow-teleport-probe' }, 'Workflow'),
            )
          : null,
      ]);
  },
});

const ConversationSidebarStub = defineComponent({
  name: 'ConversationSidebar',
  setup() {
    return () => h('aside', { 'data-testid': 'conversation-sidebar' });
  },
});

const TodayOverviewPanelStub = defineComponent({
  name: 'TodayOverviewPanel',
  props: ['active'],
  setup() {
    return () => h('div', { 'data-testid': 'today-overview-panel' }, 'Today');
  },
});

let goalRouteMountCount = 0;
const GoalRouteProbe = defineComponent({
  name: 'GoalRouteProbe',
  setup() {
    onMounted(() => {
      goalRouteMountCount += 1;
    });
    return () =>
      h('div', { 'data-testid': 'goal-draft-probe' }, [
        h('input', { 'data-testid': 'shell-resize-focus-probe' }),
      ]);
  },
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { untitled: 'Untitled' },
      nav: {
        capsule: {
          goal: 'Goals',
          task: 'Tasks',
          note: 'Notes',
          reminder: 'Reminders',
          notification: 'Notifications',
        },
        schedule: 'Schedule',
      },
      shell: {
        conversation: { today: 'Today', last7Days: 'Last 7 days', earlier: 'Earlier' },
        panel: {
          home: 'Today',
          workflow: 'Workflow',
          closeWorkflow: 'Close workflow',
          closeTab: 'Close tab',
          enterFocus: 'Enter focus',
          exitFocus: 'Exit focus',
          resize: 'Resize business panel',
        },
      },
    },
  },
});

async function mountShell(initialPath = '/', attachTo?: Element) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/goals', component: GoalRouteProbe },
      {
        path: '/settings',
        components: { settings: { template: '<div data-testid="settings-view" />' } },
        meta: { shellScene: 'settings' },
      },
    ],
  });
  await router.push(initialPath);
  await router.isReady();

  const wrapper = mount(AppShell, {
    attachTo,
    global: {
      plugins: [pinia, router, i18n],
      stubs: {
        AIChatView: AIChatViewStub,
        WindowHeader: true,
        ConversationSidebar: ConversationSidebarStub,
        BusinessPanel,
        TodayOverviewPanel: TodayOverviewPanelStub,
        PanelErrorBoundary: passThrough('PanelErrorBoundary'),
        GlobalComposer: true,
        StandaloneSettingsLayout: passThrough('StandaloneSettingsLayout'),
      },
    },
  });
  await nextTick();
  return { wrapper, router, store: useAppShellStore() };
}

describe('AppShell right-panel integration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    goalRouteMountCount = 0;
    activeChatConversationId.value = null;
  });

  it('mounts Home by default and teleports AI workflow content into the canonical panel', async () => {
    const { wrapper } = await mountShell();

    expect(wrapper.get('[data-testid="today-overview-panel"]').exists()).toBe(true);
    const workflowSurface = wrapper.get('[data-testid="shell-workflow-surface"]');
    expect(workflowSurface.find('[data-testid="workflow-teleport-probe"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the panel DOM mounted while hidden and keeps Focus independent from the sidebar', async () => {
    const { wrapper, router, store } = await mountShell();
    await router.push('/goals');
    await nextTick();
    const businessPanel = wrapper.get('[data-testid="business-panel"]').element;

    store.closeRightPanel();
    await nextTick();
    expect(wrapper.get('[data-testid="business-panel"]').element).toBe(businessPanel);
    expect(wrapper.get('[data-testid="goal-draft-probe"]').exists()).toBe(true);

    store.toggleRightPanel();
    store.toggleFocus();
    await nextTick();
    expect(wrapper.get('[data-testid="conversation-sidebar"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="app-shell"]').attributes('data-shell-state')).toBe('focus');
    wrapper.unmount();
  });

  it('restores the active input after a panel-resize pointer gesture settles', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { wrapper } = await mountShell('/goals', host);
    const input = wrapper.get('[data-testid="shell-resize-focus-probe"]').element as HTMLInputElement;
    const resizer = wrapper.get('[data-testid="business-panel-resizer"]');
    const scheduledFrames: FrameRequestCallback[] = [];
    const animationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      });

    input.focus();
    expect(document.activeElement).toBe(input);

    await resizer.trigger('pointerdown', { pointerId: 7, clientX: 700 });
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));

    // Model the browser's trailing native focus behavior after the pointerup listener.
    (resizer.element as HTMLElement).focus();
    expect(document.activeElement).toBe(resizer.element);
    expect(scheduledFrames).toHaveLength(1);

    scheduledFrames[0]?.(performance.now());
    expect(document.activeElement).toBe(input);

    animationFrame.mockRestore();
    wrapper.unmount();
    host.remove();
  });

  it('restores explicit focus/split layout independently for each AI conversation', async () => {
    const { wrapper, store } = await mountShell();
    store.rememberConversationLayout('conversation-a', 'focus');
    store.rememberConversationLayout('conversation-b', 'split');

    activeChatConversationId.value = 'conversation-a';
    await nextTick();
    expect(store.layout).toBe('focus');
    expect(store.layoutReason).toBe('user');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('data-shell-state')).toBe('focus');

    activeChatConversationId.value = 'conversation-b';
    await nextTick();
    expect(store.layout).toBe('split');
    expect(store.layoutReason).toBe('user');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('data-shell-state')).toBe('split');

    activeChatConversationId.value = 'conversation-c';
    await nextTick();
    expect(store.layout).toBe('split');
    expect(store.layoutReason).toBe('default');
    wrapper.unmount();
  });

  it('mounts a cold business deep link once after creating its shell tab', async () => {
    const { wrapper, store } = await mountShell('/goals');
    await nextTick();

    expect(store.activeTab?.route).toBe('/goals');
    expect(goalRouteMountCount).toBe(1);
    wrapper.unmount();
  });

  it('keeps the workspace and AI instance mounted while the settings scene is active', async () => {
    const { wrapper, router } = await mountShell('/goals');
    await nextTick();
    expect(goalRouteMountCount).toBe(1);
    const aiInstance = wrapper.get('[data-testid="ai-chat-view"]').element;

    await router.push('/settings');
    await nextTick();

    // 设置场景外壳切换（data-shell-scene + settings view 渲染）。
    expect(wrapper.get('[data-testid="app-shell"]').attributes('data-shell-scene')).toBe(
      'settings',
    );
    expect(wrapper.get('[data-testid="settings-view"]').exists()).toBe(true);

    // Phase 0 / UI-001：workspace scene host 常驻——AI 实例不卸载（只是隐藏），
    // 业务 Tab 组件不再重挂载（KeepAlive 缓存实例保持，流式回复/草稿不丢）。
    expect(wrapper.get('[data-testid="ai-chat-view"]').element).toBe(aiInstance);
    // v-show 隐藏 workspace host（happy-dom 下 isVisible 对祖先 display:none 检测不可靠，
    // 直接断言 v-show 写入的 inline style）。
    const workspaceHost = wrapper.get('[data-testid="shell-workspace-main"]').element
      .parentElement as HTMLElement;
    expect(workspaceHost.style.display).toBe('none');
    expect(goalRouteMountCount).toBe(1);

    // 返回 workspace 后：AI 仍是同一实例，业务 Tab 恢复且没有二次挂载。
    await router.push('/goals');
    await nextTick();
    expect(wrapper.get('[data-testid="ai-chat-view"]').element).toBe(aiInstance);
    expect(wrapper.get('[data-testid="goal-draft-probe"]').exists()).toBe(true);
    expect(goalRouteMountCount).toBe(1);
    wrapper.unmount();
  });
});
