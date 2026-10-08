import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { MAX_BUSINESS_TABS, useAppShellStore } from './useAppShellStore';

describe('useAppShellStore (V2 shell tabs)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with an open right-panel Home surface and no business tabs', () => {
    const store = useAppShellStore();
    expect(store.tabs).toHaveLength(0);
    expect(store.rightPanelOpen).toBe(true);
    expect(store.panelSurface).toBe('home');
    expect(store.activeTab).toBeUndefined();
    expect(store.layoutReason).toBe('default');
    expect(store.layoutPreference).toBeNull();
  });

  it('keeps right-panel visibility, tabs, and focus independent', () => {
    const store = useAppShellStore();
    const tab = store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'capsule',
    });

    expect(store.rightPanelOpen).toBe(true);
    expect(store.panelSurface).toBe('business');

    store.toggleRightPanel();
    expect(store.rightPanelOpen).toBe(false);
    expect(store.tabs).toHaveLength(1);
    expect(store.activeTabId).toBe(tab.tabId);
    expect(store.panelSurface).toBe('business');

    store.toggleFocus();
    expect(store.layout).toBe('focus');
    expect(store.sidebarCollapsed).toBe(false);

    store.toggleRightPanel();
    expect(store.rightPanelOpen).toBe(true);
    expect(store.activeTabId).toBe(tab.tabId);
    expect(store.panelSurface).toBe('business');
  });

  it('capsule intent reuses the existing module tab and updates its route', () => {
    const store = useAppShellStore();
    const first = store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'capsule',
    });
    const second = store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goals',
      intent: 'capsule',
    });

    expect(second.tabId).toBe(first.tabId);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0]!.route).toBe('/goals/g-1');
  });

  it('deeplink intent opens a new tab per route without preempting others', () => {
    const store = useAppShellStore();
    store.openTab({
      module: 'note',
      route: '/repository?note=a',
      title: 'Notes',
      intent: 'deeplink',
    });
    store.openTab({
      module: 'note',
      route: '/repository?note=b',
      title: 'Notes',
      intent: 'deeplink',
    });

    expect(store.tabs).toHaveLength(2);
    expect(store.activeTab?.route).toBe('/repository?note=b');

    // Same-route deeplink activates the existing tab instead of duplicating it.
    const again = store.openTab({
      module: 'note',
      route: '/repository?note=a',
      title: 'Notes',
      intent: 'deeplink',
    });
    expect(store.tabs).toHaveLength(2);
    expect(store.activeTabId).toBe(again.tabId);
    expect(store.activeTab?.route).toBe('/repository?note=a');
  });

  it('refuses to create beyond the tab limit and reports the LRU eviction candidate (Phase 1)', () => {
    const store = useAppShellStore();
    let firstId = '';
    for (let i = 0; i < MAX_BUSINESS_TABS; i += 1) {
      const result = store.openTab({
        module: 'note',
        route: `/repository?note=${i}`,
        title: `N${i}`,
        intent: 'deeplink',
      });
      if (i === 0) firstId = result.tabId;
    }

    const overflow = store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'deeplink',
    });

    // 超限不创建：tabs 数量 = KeepAlive max，杜绝缓存静默驱逐（诊断 UI-005）。
    expect(store.tabs).toHaveLength(MAX_BUSINESS_TABS);
    expect(overflow.tabId).toBe('');
    expect(overflow.evictionCandidateId).toBe(firstId);

    // UI 确认后 closeTab 候选再重试 → 新 Tab 正常创建。
    store.closeTab(firstId);
    const retried = store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'deeplink',
    });
    expect(retried.tabId).not.toBe('');
    expect(retried.evictionCandidateId).toBeNull();
    expect(store.tabs).toHaveLength(MAX_BUSINESS_TABS);
  });

  it('updates the active tab title (Phase 1 object titles)', () => {
    const store = useAppShellStore();
    const result = store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goals',
      intent: 'deeplink',
    });

    store.setActiveTabTitle('Goals · My goal');
    expect(store.tabs.find((t) => t.id === result.tabId)?.title).toBe('Goals · My goal');
  });

  it('closing the active tab activates a neighbor; closing the last returns to panel Home', () => {
    const store = useAppShellStore();
    const a = store.openTab({ module: 'goal', route: '/goals', title: 'G', intent: 'deeplink' });
    const b = store.openTab({ module: 'task', route: '/tasks', title: 'T', intent: 'deeplink' });

    const nextRoute = store.closeTab(b.tabId);
    expect(nextRoute).toBe('/goals');
    expect(store.activeTabId).toBe(a.tabId);

    store.toggleFocus();
    expect(store.closeTab(a.tabId)).toBeNull();
    expect(store.tabs).toHaveLength(0);
    expect(store.activeTabId).toBeNull();
    expect(store.panelSurface).toBe('home');
    expect(store.rightPanelOpen).toBe(true);
    expect(store.layout).toBe('focus');
    expect(store.layoutReason).toBe('user');
    expect(store.layoutPreference).toBe('focus');
  });

  it('keeps the workspace layout when returning to Home or closing all tabs', () => {
    const store = useAppShellStore();
    store.openTab({ module: 'goal', route: '/goals', title: 'G', intent: 'deeplink' });
    store.toggleFocus();

    store.showHome();
    expect(store.panelSurface).toBe('home');
    expect(store.layout).toBe('focus');
    expect(store.layoutReason).toBe('user');

    store.closeAllTabs();
    expect(store.tabs).toHaveLength(0);
    expect(store.layout).toBe('focus');
    expect(store.layoutReason).toBe('user');
  });

  it('explicit module navigation reopens a user-hidden panel', () => {
    const store = useAppShellStore();
    store.closeRightPanel();

    store.openTab({
      module: 'task',
      route: '/tasks',
      title: 'Tasks',
      intent: 'capsule',
    });

    expect(store.rightPanelOpen).toBe(true);
    expect(store.panelSurface).toBe('business');
  });

  it('migrates a persisted legacy workflow surface back to the active business surface', () => {
    const store = useAppShellStore();
    const tab = store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'capsule',
    });

    (store as unknown as { panelSurface: string }).panelSurface = 'workflow';
    store.sanitizeLegacyTabs();

    expect(store.panelSurface).toBe('business');
    expect(store.activeTabId).toBe(tab.tabId);
  });

  it('records global user intent without persisting temporary viewport focus', () => {
    const store = useAppShellStore();
    store.toggleFocus();
    expect(store.layoutPreference).toBe('focus');
    expect(store.layoutReason).toBe('user');

    store.toggleFocus();
    store.setLayout('focus', 'viewport');
    expect(store.layout).toBe('focus');
    expect(store.layoutPreference).toBe('split');

    store.restoreLayoutPreference();
    expect(store.layout).toBe('split');
    expect(store.layoutReason).toBe('user');
  });

  it.each(['focus', 'split'] as const)(
    'restores persisted %s intent and business tabs independently from viewport layout',
    async (preference) => {
      function createPersistedStore() {
        const pinia = createPinia().use(piniaPluginPersistedstate);
        createApp({}).use(pinia);
        setActivePinia(pinia);
        return useAppShellStore();
      }
      const store = createPersistedStore();
      const tab = store.openTab({
        module: 'goal',
        route: '/goals/g-1',
        title: 'Goal',
        intent: 'deeplink',
      });
      store.setLayout(preference, 'user');
      store.setLayout('focus', 'viewport');
      store.closeRightPanel();
      store.setPanelWidth(720);
      await nextTick();

      const persisted = JSON.parse(localStorage.getItem('app-shell')!);
      expect(persisted.layoutPreference).toBe(preference);
      expect(persisted).not.toHaveProperty('layout');
      expect(persisted).not.toHaveProperty('layoutReason');
      expect(persisted).not.toHaveProperty('conversationLayoutPreferences');
      const restored = createPersistedStore();
      expect(restored.layout).toBe(preference);
      expect(restored.layoutReason).toBe('user');
      expect(restored.activeTabId).toBe(tab.tabId);
      expect(restored.activeTab?.route).toBe('/goals/g-1');
      expect(restored.rightPanelOpen).toBe(false);
      expect(restored.panelWidth).toBe(720);
    },
  );

  it('retires conversation preferences while retaining tabs from existing storage', () => {
    localStorage.setItem(
      'app-shell',
      JSON.stringify({
        tabs: [
          {
            id: 'old-goal-tab',
            module: 'goal',
            route: '/goals/g-1',
            title: 'Goal',
            lastActiveAt: 1,
          },
        ],
        activeTabId: 'old-goal-tab',
        conversationLayoutPreferences: { 'conversation-a': 'focus' },
      }),
    );
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useAppShellStore();
    expect(store.layout).toBe('split');
    expect(store.layoutReason).toBe('default');
    expect(store.activeTabId).toBe('old-goal-tab');
    expect(store.activeTab?.route).toBe('/goals/g-1');
    expect(store.$state).not.toHaveProperty('conversationLayoutPreferences');
  });

  it('sanitizeLegacyTabs drops setting module tabs from persisted state', () => {
    const store = useAppShellStore();
    store.tabs = [
      {
        id: 'tab-setting-legacy',
        module: 'setting' as never,
        route: '/settings',
        title: 'Settings',
        lastActiveAt: Date.now(),
      },
      {
        id: 'tab-goal-1',
        module: 'goal',
        route: '/goals',
        title: 'Goals',
        lastActiveAt: Date.now(),
      },
    ];
    store.activeTabId = 'tab-setting-legacy';
    store.layout = 'focus';

    store.sanitizeLegacyTabs();

    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0]!.module).toBe('goal');
    expect(store.activeTabId).toBe('tab-goal-1');
  });

  it('sanitizeLegacyTabs drops retired /note editor routes from persisted tabs', () => {
    const store = useAppShellStore();
    store.tabs = [
      {
        id: 'tab-note-legacy',
        module: 'note',
        route: '/note/legacy-1',
        title: 'Legacy note',
        lastActiveAt: Date.now(),
      },
      {
        id: 'tab-repo',
        module: 'note',
        route: '/repository?note=keep-me',
        title: 'Repository',
        lastActiveAt: Date.now(),
      },
    ];
    store.activeTabId = 'tab-note-legacy';

    store.sanitizeLegacyTabs();

    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0]!.route).toBe('/repository?note=keep-me');
    expect(store.activeTabId).toBe('tab-repo');
  });

  it('keepAliveInclude mirrors the open tab ids', () => {
    const store = useAppShellStore();
    const a = store.openTab({ module: 'goal', route: '/goals', title: 'G', intent: 'deeplink' });
    const b = store.openTab({ module: 'task', route: '/tasks', title: 'T', intent: 'deeplink' });
    expect(store.keepAliveInclude).toEqual([a.tabId, b.tabId]);
  });

  it('resolvePanelWidth clamps for render without mutating preferred width', () => {
    const store = useAppShellStore();
    store.setPanelWidth(760);
    // 1200 viewport, 260 sidebar, 12px desktop chrome => max = 928-320=608
    const effective = store.resolvePanelWidth(1200, 260);
    expect(effective).toBe(608);
    expect(store.panelWidth).toBe(760);
  });

  it('uses responsive business-dominant geometry until the user sets a width preference', () => {
    const store = useAppShellStore();

    expect(store.panelWidth).toBeNull();
    expect(store.resolvePanelWidth(1280, 240)).toBe(658);
    expect(store.panelWidth).toBeNull();
  });

  it('ignores a legacy persisted pixel seed until the user explicitly resizes', () => {
    const store = useAppShellStore();
    store.panelWidth = 520;

    expect(store.panelWidthSource).toBe('responsive');
    expect(store.resolvePanelWidth(1280, 260)).toBe(645);

    store.setPanelWidth(600);
    expect(store.panelWidthSource).toBe('user');
    expect(store.resolvePanelWidth(1280, 260)).toBe(600);

    store.resetPanelWidthPreference();
    expect(store.panelWidth).toBeNull();
    expect(store.panelWidthSource).toBe('responsive');
    expect(store.resolvePanelWidth(1280, 260)).toBe(645);
  });

  it('does not clamp user widths to a product maximum', () => {
    const store = useAppShellStore();
    store.setSidebarWidth(720);
    store.setPanelWidth(1400);

    expect(store.sidebarWidth).toBe(720);
    expect(store.panelWidth).toBe(1400);
    expect(store.resolvePanelWidth(2200, 0)).toBe(1400);
  });

  it('starts without a settings origin (session-only state)', () => {
    const store = useAppShellStore();
    expect(store.settingsOrigin).toBeNull();
  });

  it('saves and clears the settings origin', () => {
    const store = useAppShellStore();
    const tab = store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goal 1',
      intent: 'deeplink',
    });

    store.saveSettingsOrigin({
      route: '/goals/g-1',
      tabId: tab.tabId,
      panelSurface: 'business',
      layout: 'focus',
      layoutReason: 'user',
    });

    expect(store.settingsOrigin).toEqual({
      route: '/goals/g-1',
      tabId: tab.tabId,
      panelSurface: 'business',
      layout: 'focus',
      layoutReason: 'user',
    });

    store.clearSettingsOrigin();
    expect(store.settingsOrigin).toBeNull();
  });
});
