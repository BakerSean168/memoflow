/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createI18nPlugin } from '../../plugins/i18n';
import { useAppShellStore } from './useAppShellStore';
import { canLeaveBusinessSurface, createSettingsSceneGuard } from './surface-leave-protocol';
import { toast } from 'vue-sonner';

const confirmState = vi.hoisted(() => {
  let pendingResolve: ((value: boolean) => void) | null = null;
  let deferred = false;
  let answer = false;
  const calls: unknown[] = [];
  return {
    calls,
    setAnswer(value: boolean) {
      answer = value;
    },
    defer() {
      deferred = true;
    },
    resolve(value: boolean) {
      pendingResolve?.(value);
      pendingResolve = null;
    },
    reset() {
      deferred = false;
      answer = false;
      pendingResolve = null;
      calls.length = 0;
    },
    call(options: unknown): Promise<boolean> {
      calls.push(options);
      if (deferred) return new Promise<boolean>((resolve) => (pendingResolve = resolve));
      return Promise.resolve(answer);
    },
  };
});

vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>();
  return {
    ...actual,
    useConfirm: (options: unknown) => confirmState.call(options),
  };
});

vi.mock('vue-sonner', () => ({
  toast: { info: vi.fn() },
}));

const MESSAGES = {
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
  },
  shell: {
    panel: {
      dirtyTransitionConfirm: 'Unsaved changes — switch anyway?',
      dirtyTransitionConfirmTitle: 'Leave this form?',
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
  let nativeConfirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
    confirmState.reset();
    nativeConfirm = vi.fn(() => false);
    window.confirm = nativeConfirm as unknown as typeof window.confirm;
  });

  it('allows leaving when the panel is not on a business surface', async () => {
    const store = setupStore();
    expect(store.panelSurface).toBe('home');
    expect(await canLeaveBusinessSurface()).toBe(true);
  });

  it('allows leaving a clean business surface', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('clean');
    expect(await canLeaveBusinessSurface()).toBe(true);
  });

  it('blocks leaving a busy business surface and explains via toast', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('busy');

    expect(await canLeaveBusinessSurface()).toBe(false);
    expect(toast.info).toHaveBeenCalledWith('Operation in progress');
  });

  it('confirms before leaving a dirty surface and respects cancel', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    confirmState.setAnswer(false);
    expect(await canLeaveBusinessSurface()).toBe(false);

    confirmState.setAnswer(true);
    expect(await canLeaveBusinessSurface()).toBe(true);
    expect(confirmState.calls).toHaveLength(2);
    expect(confirmState.calls[0]).toMatchObject({
      title: 'Leave this form?',
      description: 'Unsaved changes — switch anyway?',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('declines concurrent departures while one confirmation is pending', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    confirmState.defer();
    const first = canLeaveBusinessSurface();
    expect(await canLeaveBusinessSurface()).toBe(false);
    expect(confirmState.calls).toHaveLength(1);

    confirmState.resolve(true);
    await expect(first).resolves.toBe(true);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe('createSettingsSceneGuard (Phase 0 settings scene guard)', () => {
  const guard = createSettingsSceneGuard();
  const toSettings = { path: '/settings', fullPath: '/settings', meta: {} } as never;
  const fromGoals = { path: '/goals', fullPath: '/goals/g-1', meta: {} } as never;

  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
    confirmState.reset();
    window.confirm = vi.fn(() => false) as unknown as typeof window.confirm;
  });

  it('passes navigations that do not enter the settings scene', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    const toTasks = { path: '/tasks', fullPath: '/tasks', meta: {} } as never;
    expect(await guard(toTasks, fromGoals)).toBe(true);
  });

  it('passes clean workspace → settings', async () => {
    const store = setupStore();
    withBusinessTab(store);
    expect(await guard(toSettings, fromGoals)).toBe(true);
  });

  it('passes Home surface → settings without confirm', async () => {
    setupStore();
    const fromHome = { path: '/', fullPath: '/', meta: {} } as never;
    expect(await guard(toSettings, fromHome)).toBe(true);
  });

  it('blocks dirty workspace → settings until the user confirms', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');

    confirmState.setAnswer(false);
    expect(await guard(toSettings, fromGoals)).toBe(false);

    confirmState.setAnswer(true);
    expect(await guard(toSettings, fromGoals)).toBe(true);
  });

  it('passes settings-internal navigation even while a business surface is dirty', async () => {
    const store = setupStore();
    withBusinessTab(store);
    store.setSurfaceStatus('dirty');
    const fromSettings = { path: '/settings', fullPath: '/settings?tab=ai', meta: {} } as never;

    expect(await guard(toSettings, fromSettings)).toBe(true);
    expect(confirmState.calls).toHaveLength(0);
  });
});
