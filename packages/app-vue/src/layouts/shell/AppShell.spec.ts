import { installRoutineUiHost } from '../../di/routine-ui-host';
/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h, nextTick, onMounted, ref } from 'vue';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../di/keys';
import type { DesktopUpdateService } from '../../di/types';
import { ok } from '@memoflow/transport-contracts/result';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/desktop-contracts';
import AppShell from './AppShell.vue';
import BusinessPanel from './BusinessPanel.vue';
import { useAppShellStore } from './useAppShellStore';
import { keyboard } from '../../shared/keyboard/runtime';
import { installShellTestCleanup } from '../../test/shell-cleanup';
import { installNotificationUiHost } from '../../di/notification-ui-host';

installShellTestCleanup();
installNotificationUiHost();

vi.mock('@memoflow/notification-ui', async (importOriginal) => {
  const { ref: vueRef } = await import('vue');
  return {
    ...(await importOriginal<typeof import('@memoflow/notification-ui')>()),
    useNotificationUnreadQuery: () => ({
      unreadCount: vueRef(0),
      hasUnread: vueRef(false),
      refetch: vi.fn(async () => undefined),
    }),
  };
});

vi.mock('@memoflow/schedule-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/schedule-ui')>()),
  formatScheduleCapsuleLabel: () => '',
  useCalendarView: () => ({
    getScheduleCapsuleSnapshot: () => null,
    ensureTodayLoaded: vi.fn(async () => undefined),
  }),
}));

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
const conversationList = [
  { id: 'conversation-a', title: 'A' },
  { id: 'conversation-b', title: 'B' },
];
const selectConversation = vi.fn(async (summary: { id: string }) => {
  activeChatConversationId.value = summary.id;
});
const startNewConversation = vi.fn(() => {
  activeChatConversationId.value = null;
});
const deleteConversation = vi.fn(async (id: string) => {
  if (activeChatConversationId.value === id) activeChatConversationId.value = null;
});

const AIChatViewStub = defineComponent({
  name: 'AIChatView',
  setup(_props, { expose }) {
    expose({
      conversationList,
      conversationListLoading: false,
      chatConversationId: activeChatConversationId,
      selectConversation,
      startNewConversation,
      deleteConversation,
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
  emits: ['select-conversation', 'new-conversation', 'delete-conversation'],
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

  describe.sequential('cleanup after an aborted case', () => {
    let abandoned: Awaited<ReturnType<typeof mountShell>>;
    let host: HTMLDivElement;
    let originalMatchMedia: typeof window.matchMedia;
    let originalConfirm: typeof window.confirm;
    let originalHeight: number;
    const navigation = vi.fn(() => false);

    it.fails('aborts after mounting without reaching manual unmount', async () => {
      originalMatchMedia = window.matchMedia;
      originalConfirm = window.confirm;
      originalHeight = window.innerHeight;
      host = document.createElement('div');
      document.body.appendChild(host);
      onTestFinished(() => host.remove());
      abandoned = await mountShell('/goals', host);
      onTestFinished(abandoned.router.beforeEach(navigation));
      window.confirm = vi.fn(() => false);
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
      vi.stubGlobal('matchMedia', vi.fn());
      vi.useFakeTimers();
      setTimeout(() => window.confirm('leaked timer'), 1000);
      // Model an assertion failure before the success-path wrapper.unmount().
      throw new Error('simulated assertion abort');
    });

    it('mounts the next shell without duplicate shortcut registrations', async () => {
      const { wrapper } = await mountShell('/goals');
      expect(abandoned.wrapper.exists()).toBe(false);
      expect(host.isConnected).toBe(false);
      expect(window.matchMedia).toBe(originalMatchMedia);
      expect(window.confirm).toBe(originalConfirm);
      expect(window.innerHeight).toBe(originalHeight);
      expect(vi.isFakeTimers()).toBe(false);
      // Neither the test guard nor the shell's route-sync hook may survive.
      const abandonedState = JSON.stringify(abandoned.store.$state);
      await abandoned.router.push('/settings');
      expect(navigation).not.toHaveBeenCalled();
      expect(JSON.stringify(abandoned.store.$state)).toBe(abandonedState);
      expect(keyboard.engine.available('module.goal.preview')).toBe(true);
      wrapper.unmount();
      expect(keyboard.engine.available('module.goal.preview')).toBe(false);
    });
  });

  it.each(['sidebar', 'panel'] as const)(
    'releases an interrupted %s resize on unmount',
    async (pane) => {
      const originalUserSelect = document.body.style.userSelect;
      const originalCursor = document.body.style.cursor;
      const { wrapper, store } = await mountShell('/goals');
      const sidebar = pane === 'sidebar';
      await wrapper
        .get(`[data-testid="${sidebar ? 'conversation-sidebar' : 'business-panel'}-resizer"]`)
        .trigger(sidebar ? 'mousedown' : 'pointerdown', { pointerId: 31, clientX: 700 });

      wrapper.unmount();
      expect(document.body.style.userSelect).toBe(originalUserSelect);
      expect(document.body.style.cursor).toBe(originalCursor);
      const state = JSON.stringify(store.$state);
      window.dispatchEvent(
        sidebar
          ? new MouseEvent('mousemove', { clientX: 320 })
          : new PointerEvent('pointermove', { pointerId: 31, clientX: 650 }),
      );
      expect(JSON.stringify(store.$state)).toBe(state);
    },
  );

  it.each(['frame', 'guard'] as const)('cancels the resize focus %s on unmount', async (stage) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    onTestFinished(() => host.remove());
    const { wrapper } = await mountShell('/goals', host);
    const input = wrapper.get('[data-testid="shell-resize-focus-probe"]')
      .element as HTMLInputElement;
    input.focus();
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return 73;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
    await wrapper
      .get('[data-testid="business-panel-resizer"]')
      .trigger('pointerdown', { pointerId: 32, clientX: 700 });
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 32 }));
    expect(frames).toHaveLength(1);
    if (stage === 'guard') {
      frames[0](performance.now());
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    }

    wrapper.unmount();
    if (stage === 'frame') expect(cancelFrame).toHaveBeenCalledWith(73);
    expect(vi.getTimerCount()).toBe(0);
    // A stale focus guard would focus a replacement matching the old input.
    const replacement = document.createElement('input');
    replacement.dataset.testid = 'shell-resize-focus-probe';
    host.appendChild(replacement);
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.activeElement).not.toBe(replacement);
  });

  it('releases its preview-entry callback on unmount', async () => {
    const { wrapper } = await mountShell('/goals');
    wrapper.unmount();
    const activate = vi.fn();
    onTestFinished(keyboard.register('module.goal.activate', activate));
    onTestFinished(() => keyboard.closePreview());
    keyboard.togglePreview('goal');
    keyboard.engine.execute('preview.open');
    expect(activate).not.toHaveBeenCalled();
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
    onTestFinished(() => host.remove());
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

    // Close the lingering gesture guard so it cannot leak into later tests.
    document.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, bubbles: true }));
    animationFrame.mockRestore();
    wrapper.unmount();
    host.remove();
  });

  it('redirects a late native focus steal that lands after the resize restore', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    onTestFinished(() => host.remove());
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
    await resizer.trigger('pointerdown', { pointerId: 7, clientX: 700 });
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));

    // The restore settles first; only afterwards does the browser's trailing
    // native focus default steal focus for the focusable drag handle. The
    // gesture guard must keep redirecting such late steals — not just for one
    // frame — because loaded machines can defer the native default far beyond
    // the next animation frame.
    scheduledFrames.splice(0, 1).forEach((frame) => frame(performance.now()));
    expect(document.activeElement).toBe(input);
    (resizer.element as HTMLElement).focus();
    expect(document.activeElement).toBe(input);
    (resizer.element as HTMLElement).focus();
    expect(document.activeElement).toBe(input);

    // A real user interaction ends the guard; later focus changes stay untouched.
    document.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }));
    (resizer.element as HTMLElement).focus();
    expect(document.activeElement).toBe(resizer.element);

    animationFrame.mockRestore();
    wrapper.unmount();
    host.remove();
  });

  it.each(
    (['select', 'new', 'keyboard-new', 'delete'] as const).flatMap((action) =>
      (['split', 'focus'] as const).flatMap((layout) =>
        [true, false].map((open) => ({ action, layout, open })),
      ),
    ),
  )(
    '$action conversation preserves the workspace ($layout, panel open: $open)',
    async ({ action, layout, open }) => {
      const { wrapper, router, store } = await mountShell('/goals');
      activeChatConversationId.value = 'conversation-a';
      await nextTick();
      store.setLayout(layout, 'user');
      if (!open) store.closeRightPanel();
      store.setPanelWidth(700);
      store.setSidebarWidth(280);
      store.setSurfaceStatus('dirty');
      await nextTick();
      const input = wrapper.get('[data-testid="shell-resize-focus-probe"]');
      await input.setValue('Unsaved goal draft');
      const businessView = wrapper.get('[data-testid="goal-draft-probe"]').element as HTMLElement;
      businessView.scrollTop = 120;
      const before = JSON.stringify(store.$state);
      const originalConfirm = window.confirm;
      const confirm = vi.fn(() => false);
      window.confirm = confirm;
      const navigation = vi.fn(() => false);
      const removeGuard = router.beforeEach(navigation);
      onTestFinished(removeGuard);

      const sidebar = wrapper.getComponent(ConversationSidebarStub);
      if (action === 'select') sidebar.vm.$emit('select-conversation', 'conversation-b');
      if (action === 'new') sidebar.vm.$emit('new-conversation');
      if (action === 'keyboard-new') keyboard.engine.execute('conversation.new');
      if (action === 'delete') sidebar.vm.$emit('delete-conversation', 'conversation-a');
      await flushPromises();

      expect(activeChatConversationId.value).toBe(action === 'select' ? 'conversation-b' : null);
      expect(JSON.stringify(store.$state)).toBe(before);
      expect(router.currentRoute.value.fullPath).toBe('/goals');
      expect(wrapper.get('[data-testid="goal-draft-probe"]').element).toBe(businessView);
      expect(businessView.scrollTop).toBe(120);
      expect((input.element as HTMLInputElement).value).toBe('Unsaved goal draft');
      expect(goalRouteMountCount).toBe(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(navigation).not.toHaveBeenCalled();
      if (action === 'new' || action === 'keyboard-new')
        expect(startNewConversation).toHaveBeenCalledWith('chat');
      if (action === 'delete') expect(deleteConversation).toHaveBeenCalledWith('conversation-a');
      window.confirm = originalConfirm;
      removeGuard();
      wrapper.unmount();
    },
  );

  it.each(['focus', 'split'] as const)(
    'restores global %s intent after a narrow viewport without changing tabs',
    async (preference) => {
      const { wrapper, store } = await mountShell('/goals');
      store.setLayout(preference, 'user');
      const tabId = store.activeTabId;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      window.dispatchEvent(new Event('resize'));
      await nextTick();
      expect(store.layout).toBe('focus');
      expect(store.layoutPreference).toBe(preference);
      activeChatConversationId.value = 'conversation-b';
      await nextTick();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      window.dispatchEvent(new Event('resize'));
      await nextTick();
      expect(store.layout).toBe(preference);
      expect(store.layoutReason).toBe('user');
      expect(store.activeTabId).toBe(tabId);
      expect(goalRouteMountCount).toBe(1);
      wrapper.unmount();
    },
  );

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

installRoutineUiHost();
