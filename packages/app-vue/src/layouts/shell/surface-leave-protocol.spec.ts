/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createI18nPlugin } from '../../plugins/i18n';
import { useAppShellStore } from './useAppShellStore';
import { canLeaveBusinessSurface, createSettingsSceneGuard } from './surface-leave-protocol';
import { toast } from 'vue-sonner';

vi.mock('vue-sonner', () => ({
  toast: { info: vi.fn() },
}));

const MESSAGES = {
  shell: {
    panel: {
      dirtyTransitionConfirm: 'Unsaved changes — switch anyway?',
      busyTransitionHint: 'Operation in progress',
    },
  },
};

function setupStore() {
  setActivePinia(createPinia());
  createI18nPlugin('en-US', MESSAGES);
  return useAppShellStore();
}

function withBusinessTab(store: ReturnType<typeof useAppShellStore>) {
  store.openTab({ module: 'goal', route: '/goals/g-1', title: 'Goal 1', intent: 'deeplink' });
}

describe('canLeaveBusinessSurface (Phase 0 unified leave protocol)', () => {
  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
  });

  it('allows leaving when the panel is not on a business surface', () => {
    const store = setupStore();
    expect(store.panelSurface).toBe('home');
    expect(canLeaveBusinessSurface()).toBe(true);
  });

  it('allows leaving a clean business surface', () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('clean');
    expect(canLeaveBusinessSurface()).toBe(true);
  });

  it('blocks leaving a busy business surface and explains via toast', () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('busy');

    expect(canLeaveBusinessSurface()).toBe(false);
    expect(toast.info).toHaveBeenCalledWith('Operation in progress');
  });

  it('confirms before leaving a dirty surface and respects cancel', () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    window.confirm = vi.fn(() => false) as unknown as typeof window.confirm;
    expect(canLeaveBusinessSurface()).toBe(false);

    window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;
    expect(canLeaveBusinessSurface()).toBe(true);
  });
});

describe('createSettingsSceneGuard (Phase 0 settings scene guard)', () => {
  const guard = createSettingsSceneGuard();
  const toSettings = { path: '/settings', fullPath: '/settings', meta: {} } as never;
  const fromGoals = { path: '/goals', fullPath: '/goals/g-1', meta: {} } as never;

  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
  });

  it('passes navigations that do not enter the settings scene', () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    const toTasks = { path: '/tasks', fullPath: '/tasks', meta: {} } as never;
    expect(guard(toTasks, fromGoals)).toBe(true);
  });

  it('passes clean workspace → settings', () => {
    const store = setupStore();
    withBusinessTab(store);
    expect(guard(toSettings, fromGoals)).toBe(true);
  });

  it('passes Home surface → settings without confirm', () => {
    setupStore();
    const fromHome = { path: '/', fullPath: '/', meta: {} } as never;
    expect(guard(toSettings, fromHome)).toBe(true);
  });

  it('blocks dirty workspace → settings until the user confirms', () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    window.confirm = vi.fn(() => false) as unknown as typeof window.confirm;
    expect(guard(toSettings, fromGoals)).toBe(false);

    window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;
    expect(guard(toSettings, fromGoals)).toBe(true);
  });

  it('passes settings-internal navigation even while a business surface is dirty', () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');
    const fromSettings = { path: '/settings', fullPath: '/settings?tab=ai', meta: {} } as never;

    expect(guard(toSettings, fromSettings)).toBe(true);
  });
});
