/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  moduleForPath,
  MODULE_TITLE_KEYS,
  isStandaloneSettingsPath,
  resolveEntryLayout,
  AUTO_FOCUS_VIEWPORT,
} from './useShellRouterSync';
import { useShellRouterSync } from './useShellRouterSync';
import { MAX_BUSINESS_TABS, useAppShellStore } from './useAppShellStore';

const originalInnerWidth = window.innerWidth;

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: originalInnerWidth,
  });
});

describe('moduleForPath (V2 §3 module matrix + settings scene D)', () => {
  it('maps every business route family to its shell module', () => {
    expect(moduleForPath('/goals')).toBe('goal');
    expect(moduleForPath('/goals/g-1')).toBe('goal');
    expect(moduleForPath('/goals/g-1/key-results/kr-1')).toBe('goal');
    expect(moduleForPath('/tasks')).toBe('task');
    expect(moduleForPath('/tasks/t-1')).toBe('task');
    expect(moduleForPath('/routines')).toBe('routine');
    expect(moduleForPath('/routines/r-1')).toBe('routine');
    expect(moduleForPath('/repository')).toBe('note');
    // retired /note/:id editor route no longer maps into the shell
    expect(moduleForPath('/note/n-1')).toBeNull();
    expect(moduleForPath('/governance')).toBe('note');
    expect(moduleForPath('/governance/r-1/history')).toBe('note');
    // Legacy Reminder routes are physically retired; notifications remain a shell module.
    expect(moduleForPath('/reminders')).toBeNull();
    expect(moduleForPath('/notifications')).toBe('notification');
    expect(moduleForPath('/sse-monitor')).toBe('notification');
    expect(moduleForPath('/schedule')).toBe('schedule');
    expect(moduleForPath('/schedule/calendar')).toBe('schedule');
  });

  it('does not map settings/account into BusinessTab modules', () => {
    expect(moduleForPath('/settings')).toBeNull();
    expect(moduleForPath('/settings/')).toBeNull();
    expect(moduleForPath('/account')).toBeNull();
    expect(moduleForPath('/account/center')).toBeNull();
    expect(isStandaloneSettingsPath('/settings')).toBe(true);
    expect(isStandaloneSettingsPath('/settings/anything')).toBe(true);
    expect(isStandaloneSettingsPath('/account/center')).toBe(true);
    expect(isStandaloneSettingsPath('/tasks')).toBe(false);
  });

  it('returns null for shell-external and unknown paths', () => {
    expect(moduleForPath('/')).toBeNull();
    expect(moduleForPath('/auth')).toBeNull();
    expect(moduleForPath('/custom-notification')).toBeNull();
    expect(moduleForPath('/notes-typo')).toBeNull();
  });

  it('does not treat prefix-similar paths as module routes', () => {
    // '/notes' is not '/note' nor '/notifications'
    expect(moduleForPath('/notes')).toBeNull();
    expect(moduleForPath('/goalsmith')).toBeNull();
  });

  it('has a tab title key for every shell module', () => {
    for (const key of Object.values(MODULE_TITLE_KEYS)) {
      expect(key).toMatch(/^nav\./);
    }
    expect(MODULE_TITLE_KEYS).not.toHaveProperty('setting');
  });
});

describe('resolveEntryLayout (schedule/settings no longer force focus)', () => {
  it('auto-focuses only when the viewport cannot host a safe split', () => {
    expect(resolveEntryLayout(900, 'split', 'default')).toEqual({
      layout: 'focus',
      reason: 'viewport',
    });
    expect(resolveEntryLayout(AUTO_FOCUS_VIEWPORT, 'split', 'default')).toBeNull();
    expect(resolveEntryLayout(1200, 'split', 'default')).toBeNull();
  });

  it('auto-focuses when geometry reports canSplit=false even on wide viewports', () => {
    expect(resolveEntryLayout(1024, 'split', 'default', false)).toEqual({
      layout: 'focus',
      reason: 'viewport',
    });
    expect(resolveEntryLayout(1200, 'split', 'default', true)).toBeNull();
  });

  it('preserves explicit user focus when re-entering a module on a wide viewport', () => {
    expect(resolveEntryLayout(1400, 'focus', 'user')).toBeNull();
  });

  it('can restore split when previous focus was viewport-driven and space returns', () => {
    expect(resolveEntryLayout(1400, 'focus', 'viewport')).toEqual({
      layout: 'split',
      reason: 'default',
    });
  });
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: { capsule: { goal: 'Goals' } },
      shell: {
        panel: {
          dirtyTransitionConfirm: 'Continue with unsaved changes?',
          busyTransitionHint: 'Please wait',
        },
      },
    },
  },
});

async function mountRouterSync(initialPath: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/goals', component: { template: '<div />' } },
      { path: '/goals/g-1', component: { template: '<div />' } },
      { path: '/goals/g-2', component: { template: '<div />' } },
      { path: '/tasks', component: { template: '<div />' } },
      { path: '/routines', component: { template: '<div />' } },
      {
        path: '/settings',
        component: { template: '<div />' },
        meta: { shellScene: 'settings' },
      },
    ],
  });
  await router.push(initialPath);
  await router.isReady();

  let actions: ReturnType<typeof useShellRouterSync> | null = null;
  const Host = defineComponent({
    setup() {
      actions = useShellRouterSync();
      return () => h('div');
    },
  });

  return {
    pinia,
    router,
    store: useAppShellStore(),
    actions: () => actions!,
    mount: () => mount(Host, { global: { plugins: [pinia, router, i18n] } }),
  };
}

describe('useShellRouterSync startup restoration', () => {
  it('preserves a user-hidden Home panel across startup and reopens it on explicit navigation', async () => {
    const fixture = await mountRouterSync('/');
    fixture.store.closeRightPanel();

    const wrapper = fixture.mount();
    expect(fixture.store.rightPanelOpen).toBe(false);

    await fixture.router.push('/goals');
    expect(fixture.store.rightPanelOpen).toBe(true);
    expect(fixture.store.panelSurface).toBe('business');
    wrapper.unmount();
  });

  it('preserves a hidden persisted business tab when startup restores its existing URL', async () => {
    const fixture = await mountRouterSync('/goals');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'deeplink',
    });
    fixture.store.closeRightPanel();

    const wrapper = fixture.mount();

    expect(fixture.store.rightPanelOpen).toBe(false);
    expect(fixture.store.activeTab?.route).toBe('/goals');
    wrapper.unmount();
  });

  it('keeps the Home surface visible by using viewport focus when a narrow layout cannot split', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    const fixture = await mountRouterSync('/goals');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();

    await fixture.router.push('/');

    expect(fixture.store.panelSurface).toBe('home');
    expect(fixture.store.layout).toBe('focus');
    expect(fixture.store.layoutReason).toBe('viewport');
    wrapper.unmount();
  });

  it('preserves the form-owned dirty status after the user confirms hiding the panel', async () => {
    const fixture = await mountRouterSync('/goals');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();
    fixture.store.setSurfaceStatus('dirty');
    const confirm = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });

    await fixture.actions().closePanel();

    expect(confirm).toHaveBeenCalledOnce();
    expect(fixture.store.rightPanelOpen).toBe(false);
    expect(fixture.store.surfaceStatus).toBe('dirty');
    wrapper.unmount();
  });
});

describe('useShellRouterSync settings origin (Phase 0 / UI-007)', () => {
  it('saves the workspace origin when entering settings and restores it on return', async () => {
    const fixture = await mountRouterSync('/goals/g-1');
    const tab = fixture.store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goal 1',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();

    await fixture.router.push('/settings');

    expect(fixture.store.settingsOrigin).toEqual({
      route: '/goals/g-1',
      tabId: tab.tabId,
      panelSurface: 'business',
      layout: 'split',
      layoutReason: 'default',
    });

    await fixture.actions().returnFromSettings();

    expect(fixture.router.currentRoute.value.fullPath).toBe('/goals/g-1');
    expect(fixture.store.activeTabId).toBe(tab.tabId);
    expect(fixture.store.settingsOrigin).toBeNull();
    wrapper.unmount();
  });

  it('returns to the active tab when settings were deep-linked (no origin)', async () => {
    const fixture = await mountRouterSync('/settings');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'capsule',
    });
    const wrapper = fixture.mount();

    await fixture.actions().returnFromSettings();

    expect(fixture.router.currentRoute.value.fullPath).toBe('/goals');
    expect(fixture.store.activeTab?.route).toBe('/goals');
    wrapper.unmount();
  });

  it('falls back to Home when the saved origin tab is gone', async () => {
    const fixture = await mountRouterSync('/goals/g-1');
    const tab = fixture.store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goal 1',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();

    await fixture.router.push('/settings');
    // 进入设置后原 Tab 被外部动作关闭 → origin 失效。
    fixture.store.closeTab(tab.tabId);

    await fixture.actions().returnFromSettings();

    expect(fixture.router.currentRoute.value.fullPath).toBe('/');
    expect(fixture.store.panelSurface).toBe('home');
    wrapper.unmount();
  });

  it('clears the origin when leaving settings back into a business route', async () => {
    const fixture = await mountRouterSync('/goals');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals',
      title: 'Goals',
      intent: 'capsule',
    });
    const wrapper = fixture.mount();

    await fixture.router.push('/settings');
    expect(fixture.store.settingsOrigin).not.toBeNull();

    // 浏览器 back / 直接导航离开设置 → afterEach 清除 origin。
    await fixture.router.push('/goals');
    expect(fixture.store.settingsOrigin).toBeNull();
    wrapper.unmount();
  });
});

describe('useShellRouterSync Phase 1 landing / deep-link semantics', () => {
  it('lands on the module list even when a detail tab already exists', async () => {
    const fixture = await mountRouterSync('/goals/g-1');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goals',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();

    await fixture.actions().openModule('goal', '/goals');

    expect(fixture.router.currentRoute.value.fullPath).toBe('/goals');
    expect(fixture.store.activeTab?.route).toBe('/goals');
    expect(fixture.store.tabs).toHaveLength(1); // landing 复用已有 Tab，不新建
    wrapper.unmount();
  });

  it('opens a new tab for a distinct deep-link route (multi-tab per module)', async () => {
    const fixture = await mountRouterSync('/tasks');
    const wrapper = fixture.mount();
    expect(fixture.store.tabs).toHaveLength(1); // startup 深链建 task Tab

    // 跨模块 deep-link：活动 task Tab 时打开 goal 详情 → 新开 goal Tab。
    await fixture.router.push('/goals/g-1');
    await nextTick();

    expect(fixture.store.tabs).toHaveLength(2);
    expect(fixture.store.activeTab?.route).toBe('/goals/g-1');
    expect(fixture.store.tabs.find((t) => t.module === 'task')).toBeDefined();
    wrapper.unmount();
  });

  it('reuses the existing tab for the same deep-link route', async () => {
    const fixture = await mountRouterSync('/goals/g-1');
    const tab = fixture.store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goals',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();

    await fixture.router.push('/goals/g-1');
    await nextTick();

    expect(fixture.store.tabs).toHaveLength(1);
    expect(fixture.store.activeTabId).toBe(tab.tabId);
    wrapper.unmount();
  });

  it('rolls the URL back when the tab-limit confirm is cancelled (review P1)', async () => {
    const fixture = await mountRouterSync('/goals');
    const wrapper = fixture.mount();
    // 初始 startup 已有 1 个 goal Tab；再开满至 MAX_BUSINESS_TABS。
    for (let i = 0; i < MAX_BUSINESS_TABS - 1; i += 1) {
      fixture.store.openTab({
        module: 'note',
        route: `/repository?note=${i}`,
        title: `N${i}`,
        intent: 'deeplink',
      });
    }
    expect(fixture.store.tabs).toHaveLength(MAX_BUSINESS_TABS);

    const denyConfirm = vi.fn(() => false);
    Object.defineProperty(window, 'confirm', { configurable: true, value: denyConfirm });
    await fixture.router.push('/goals/g-2');
    // afterEach 内的回滚 replace 是异步发起的，等待其导航完成。
    await flushPromises();
    await nextTick();
    await flushPromises();

    // 取消：不创建 Tab，URL 回滚到进入前 → URL/Tab/对象保持一致。
    expect(fixture.store.tabs).toHaveLength(MAX_BUSINESS_TABS);
    expect(fixture.router.currentRoute.value.fullPath).toBe('/goals');
    wrapper.unmount();
  });

  it('restores the workflow origin surface after returning from settings (review P1)', async () => {
    const fixture = await mountRouterSync('/goals/g-1');
    fixture.store.openTab({
      module: 'goal',
      route: '/goals/g-1',
      title: 'Goal 1',
      intent: 'deeplink',
    });
    const wrapper = fixture.mount();
    // mount 时 restoreStartupRoute 会按业务路由重置 surface；
    // 真实进入设置→返回场景 workspace 常驻不重挂，这里在 mount 后设 workflow。
    fixture.store.setWorkflowAvailable(true);
    fixture.store.requestWorkflowSurface('explicit');

    await fixture.router.push('/settings');
    expect(fixture.store.settingsOrigin?.panelSurface).toBe('workflow');

    await fixture.actions().returnFromSettings();

    expect(fixture.router.currentRoute.value.fullPath).toBe('/goals/g-1');
    expect(fixture.store.panelSurface).toBe('workflow');
    wrapper.unmount();
  });
});
