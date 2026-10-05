/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h, nextTick, onMounted, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../di/keys';
import type { DesktopUpdateService } from '../../di/types';
import { ok } from '@memoflow/contracts/result';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
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
    expose({
      conversationList: [],
      conversationListLoading: false,
      chatConversationId: activeChatConversationId,
    });

    return () => h('div', { 'data-testid': 'ai-chat-view' });
  },
});

const WindowHeaderStub = defineComponent({
  name: 'WindowHeader',
  props: {
    sidebarCollapsed: { type: Boolean, default: false },
  },
  emits: ['toggle-sidebar'],
  setup(props, { emit, slots }) {
    return () =>
      h('header', { 'data-testid': 'window-header-stub' }, [
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'shell-sidebar-toggle',
            'aria-expanded': String(!props.sidebarCollapsed),
            onClick: () => emit('toggle-sidebar'),
          },
          'Toggle sidebar',
        ),
        slots['status-actions']?.(),
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
      common: { untitled: 'Untitled', close: 'Close' },
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
        update: {
          ready: 'Update {version} ready',
          attention: 'Update needs attention',
          openSettings: 'Open update settings',
        },
        conversation: {
          today: 'Today',
          last7Days: 'Last 7 days',
          earlier: 'Earlier',
          navigation: 'Conversation navigation',
          resize: 'Resize conversations',
        },
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

async function mountShell(
  initialPath = '/',
  attachTo?: Element,
  updateService?: DesktopUpdateService,
) {
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
      provide: updateService ? { [DESKTOP_UPDATE_SERVICE_KEY as symbol]: updateService } : {},
      stubs: {
        AIChatView: AIChatViewStub,
        WindowHeader: WindowHeaderStub,
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

  it('routes the update indicator through settings without starting an install', async () => {
    const ready: DesktopUpdateSnapshotDTO = {
      currentVersion: '1.2.0',
      channel: 'stable',
      owner: 'memoflow-direct',
      capabilities: {
        canCheck: true,
        canBackgroundCheck: true,
        canDownload: true,
        canSelfInstall: true,
        canAutoDownload: true,
        installAuthority: 'memoflow',
      },
      state: {
        type: 'ready',
        intent: 'background',
        release: {
          version: '1.3.0',
          channel: 'stable',
          publishedAt: null,
          releaseNotes: null,
          releaseNotesUrl: null,
        },
      },
    };
    const unsubscribe = vi.fn();
    const service: DesktopUpdateService = {
      getDiagnostics: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'INTERNAL_ERROR', message: 'Unavailable' },
      })),
      getSnapshot: vi.fn(async () => ok(ready)),
      check: vi.fn(async () => ok(ready)),
      restartAndInstall: vi.fn(async () => ok(ready)),
      subscribe: vi.fn(() => unsubscribe),
    };
    const { wrapper, router, store } = await mountShell('/goals', undefined, service);
    await flushPromises();

    await wrapper.get('[data-testid="desktop-update-shell-indicator"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/settings?tab=updates');
    expect(wrapper.get('[data-testid="settings-view"]').exists()).toBe(true);
    expect(store.settingsOrigin?.route).toBe('/goals');
    expect(service.check).not.toHaveBeenCalled();
    expect(service.restartAndInstall).not.toHaveBeenCalled();
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('mounts Home by default without a shell-owned workflow surface', async () => {
    const { wrapper } = await mountShell();

    expect(wrapper.get('[data-testid="today-overview-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shell-workflow-surface"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a flush sidebar beside one rounded Chat + Business content well', async () => {
    const { wrapper } = await mountShell();

    expect(wrapper.get('[data-testid="shell-workspace-stage"]').classes()).toContain(
      'workspace-stage',
    );
    expect(wrapper.get('[data-testid="shell-sidebar-pane"]').classes()).toContain(
      'workspace-sidebar-shell',
    );
    expect(wrapper.get('[data-testid="shell-workspace-main"]').classes()).toContain(
      'workspace-content-well',
    );
    expect(wrapper.get('[data-testid="shell-ai-column"]').classes()).toContain(
      'workspace-primary-surface',
    );
    expect(wrapper.get('[data-testid="shell-business-pane"]').classes()).toContain(
      'workspace-business-surface',
    );

    expect(wrapper.get('[data-testid="shell-sidebar-pane"]').classes()).not.toContain(
      'workspace-pane',
    );
    expect(wrapper.get('[data-testid="shell-business-pane"]').classes()).not.toContain(
      'workspace-pane',
    );

    const sidebarResizer = wrapper.get('[data-testid="conversation-sidebar-resizer"]');
    expect(sidebarResizer.attributes()).toMatchObject({
      role: 'separator',
      tabindex: '0',
      'aria-orientation': 'vertical',
    });
    expect(sidebarResizer.classes()).toContain('workspace-resizer--right');

    const businessResizer = wrapper.get('[data-testid="business-panel-resizer"]');
    expect(businessResizer.attributes()).toMatchObject({
      role: 'separator',
      tabindex: '0',
      'aria-orientation': 'vertical',
    });
    expect(businessResizer.classes()).toContain('workspace-resizer--left');
    wrapper.unmount();
  });

  it('uses an off-canvas overlay sidebar below 960px without mutating the docked preference', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    const { wrapper, store } = await mountShell('/goals');

    expect(store.sidebarCollapsed).toBe(false);
    expect(wrapper.find('[data-testid="shell-sidebar-pane-host"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="shell-sidebar-toggle"]').attributes('aria-expanded')).toBe(
      'false',
    );

    await wrapper.get('[data-testid="shell-sidebar-toggle"]').trigger('click');
    await nextTick();

    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="shell-sidebar-pane-host"][data-sidebar-presentation="overlay"]',
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(wrapper.find('[data-testid="conversation-sidebar-resizer"]').exists()).toBe(false);
    expect(store.sidebarCollapsed).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    await flushPromises();
    expect(
      document.querySelector(
        '[data-testid="shell-sidebar-pane-host"][data-sidebar-presentation="overlay"]',
      ),
    ).toBeNull();
    expect(store.sidebarCollapsed).toBe(false);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    window.dispatchEvent(new Event('resize'));
    await nextTick();

    const docked = wrapper.get('[data-testid="shell-sidebar-pane-host"]');
    expect(docked.attributes('data-sidebar-presentation')).toBe('docked');
    expect(wrapper.get('[data-testid="conversation-sidebar-resizer"]').exists()).toBe(true);
    expect(store.sidebarCollapsed).toBe(false);
    wrapper.unmount();
  });

  it('keeps a collapsed desktop preference while still allowing narrow overlay navigation', async () => {
    const { wrapper, store } = await mountShell('/goals');
    store.setSidebarCollapsed(true);
    await nextTick();

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(wrapper.find('[data-testid="shell-sidebar-pane-host"]').exists()).toBe(false);
    await wrapper.get('[data-testid="shell-sidebar-toggle"]').trigger('click');
    await nextTick();
    expect(
      document
        .querySelector('[data-testid="shell-sidebar-pane-host"]')
        ?.getAttribute('data-sidebar-presentation'),
    ).toBe('overlay');
    expect(store.sidebarCollapsed).toBe(true);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(wrapper.find('[data-testid="shell-sidebar-pane-host"]').exists()).toBe(false);
    expect(store.sidebarCollapsed).toBe(true);
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

  it('reapplies viewport focus when reopening the right panel on a narrow screen', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const { wrapper, store } = await mountShell();

    store.closeRightPanel();
    await nextTick();
    store.setLayout('split', 'default');
    await nextTick();

    store.toggleRightPanel();
    await nextTick();

    expect(store.layout).toBe('focus');
    expect(store.layoutReason).toBe('viewport');
    expect(wrapper.get('[data-testid="app-shell"]').attributes('data-shell-state')).toBe('focus');
    wrapper.unmount();
  });

  it('updates the persisted business width from the visible gutter resizer', async () => {
    const { wrapper, store } = await mountShell('/goals');
    const resizer = wrapper.get('[data-testid="business-panel-resizer"]');

    expect(store.panelWidth).toBeNull();
    await resizer.trigger('pointerdown', { pointerId: 11, clientX: 640 });
    window.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 11, clientX: 620, bubbles: true }),
    );
    await nextTick();

    expect(store.panelWidthSource).toBe('user');
    expect(store.panelWidth).toBe(654);

    window.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 11, clientX: 620, bubbles: true }),
    );
    wrapper.unmount();
  });

  it('restores the active input after a panel-resize pointer gesture settles', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { wrapper } = await mountShell('/goals', host);
    const input = wrapper.get('[data-testid="shell-resize-focus-probe"]')
      .element as HTMLInputElement;
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
    expect(scheduledFrames.length).toBeGreaterThanOrEqual(1);

    for (let index = 0; index < 5 && scheduledFrames.length > 0; index += 1) {
      scheduledFrames.shift()?.(performance.now());
    }
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
