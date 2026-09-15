// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app = {
    use: vi.fn(),
    mount: vi.fn(),
  };
  const pinia = {
    use: vi.fn(),
  };
  const router = {
    beforeEach: vi.fn(),
    afterEach: vi.fn(),
    isReady: vi.fn(async () => undefined),
    replace: vi.fn(),
    currentRoute: {
      value: { name: 'home' },
    },
  };
  const authStore = {
    hydrateCloudSession: vi.fn(),
    reset: vi.fn(),
  };
  const accountStore = {
    setCurrentAccount: vi.fn(),
    reset: vi.fn(),
  };
  const bridge = { invoke: vi.fn() };
  const notificationHook = {
    start: vi.fn(),
  };
  const serverStateRuntime = {
    queryClient: {},
    dispatcher: { invalidate: vi.fn(async () => undefined) },
    dispose: vi.fn(),
    clearIdentity: vi.fn(),
  };

  return {
    app,
    pinia,
    router,
    authStore,
    accountStore,
    bridge,
    notificationHook,
    serverStateRuntime,
    createApp: vi.fn(() => app),
    createPinia: vi.fn(() => pinia),
    createAppRouter: vi.fn(() => router),
    useAuthenticationStore: vi.fn(() => authStore),
    usePresentationPreferenceStore: vi.fn(() => ({ locale: 'en-US' })),
    createI18nPlugin: vi.fn(() => ({ name: 'desktop-i18n-plugin' })),
    loadLocaleMessages: vi.fn(async () => ({ hello: 'desktop' })),
    translateMessageKey: vi.fn((key: string) => (key === 'dashboard.title' ? 'Dashboard' : key)),
    requireElectronBridge: vi.fn(() => bridge),
    readDesktopAccessSnapshot: vi.fn(async () => ({ unlockState: 'UNLOCKED' })),
    getCloudSession: vi.fn(async () => ({
      ok: true,
      data: { account: { id: 'cloud-1' }, session: { id: 'session-1' } },
    })),
    getMyProfile: vi.fn(async () => ({
      ok: true,
      data: { account: { toDTO: () => ({ id: 'cloud-1' }) } },
    })),
    createNotificationStartupHook: vi.fn(() => notificationHook),
    installDesktopServerStateRuntime: vi.fn(() => serverStateRuntime),
    getDesktopServerStateRuntime: vi.fn(() => serverStateRuntime),
    registerDesktopServerStateSource: vi.fn(),
    isDesktopServerStateDisposed: vi.fn(() => false),
    registerDesktopServerStateStartupCancel: vi.fn(),
    initElectronFeatures: vi.fn(),
    shouldRedirectAuthenticatedDesktopEntry: vi.fn(() => true),
    progressStart: vi.fn(),
    progressDone: vi.fn(),
    requestIdleCallback: vi.fn((cb: IdleRequestCallback) => {
      cb({
        didTimeout: false,
        timeRemaining: () => 0,
      } as IdleDeadline);
      return 1;
    }),
  };
});

vi.mock('vue', () => ({
  createApp: mocks.createApp,
}));

vi.mock('pinia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pinia')>()),
  createPinia: mocks.createPinia,
}));

vi.mock('pinia-plugin-persistedstate', () => ({
  default: 'persisted-plugin',
}));

vi.mock('@memoflow/assets', () => ({
  APP_TITLE_NAME: 'MemoFlow',
}));

vi.mock('@memoflow/app-vue/router', () => ({
  createAppRouter: mocks.createAppRouter,
}));

vi.mock('@memoflow/app-vue/modules/authentication', () => ({
  useAuthenticationStore: mocks.useAuthenticationStore,
}));

vi.mock('@memoflow/app-vue/modules/account', () => ({
  useAccountStore: vi.fn(() => mocks.accountStore),
}));

vi.mock('@memoflow/app-vue/plugins/i18n', () => ({
  createI18nPlugin: mocks.createI18nPlugin,
  loadLocaleMessages: mocks.loadLocaleMessages,
  translateMessageKey: mocks.translateMessageKey,
}));

vi.mock('@memoflow/app-vue/desktop', () => ({
  readDesktopAccessSnapshot: mocks.readDesktopAccessSnapshot,
}));

vi.mock('@memoflow/cloud-auth', () => ({
  createCloudAuthIpcClient: vi.fn(() => ({ getSession: mocks.getCloudSession })),
}));

vi.mock('@memoflow/account/client', () => ({
  createAccountIpcClient: vi.fn(() => ({ getMyProfile: mocks.getMyProfile })),
}));

vi.mock('@memoflow/ipc-client', () => ({
  createResultIpcClient: vi.fn(() => ({})),
}));

vi.mock('@memoflow/app-vue/modules/notification', () => ({
  createNotificationStartupHook: mocks.createNotificationStartupHook,
  createNotificationClickNavigation: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('@memoflow/app-vue/modules/setting', () => ({
  usePresentationPreferenceStore: mocks.usePresentationPreferenceStore,
}));

vi.mock('@memoflow/ui-vue-shadcn/composables/useProgressBar', () => ({
  progressStart: mocks.progressStart,
  progressDone: mocks.progressDone,
}));

vi.mock('../App.vue', () => ({
  default: { name: 'DesktopAppRoot' },
}));

vi.mock('../CustomNotificationView.vue', () => ({
  default: { name: 'CustomNotificationView' },
}));

vi.mock('../platform/di-app', () => ({
  installDesktopAppServices: { name: 'install-desktop-app-services' },
}));

vi.mock('../platform/electron', () => ({
  initElectronFeatures: mocks.initElectronFeatures,
}));

vi.mock('../platform/server-state', () => ({
  installDesktopServerStateRuntime: mocks.installDesktopServerStateRuntime,
  getDesktopServerStateRuntime: mocks.getDesktopServerStateRuntime,
  registerDesktopServerStateSource: mocks.registerDesktopServerStateSource,
  isDesktopServerStateDisposed: mocks.isDesktopServerStateDisposed,
  registerDesktopServerStateStartupCancel: mocks.registerDesktopServerStateStartupCancel,
}));

vi.mock('../platform/electron-bridge', () => ({
  requireElectronBridge: mocks.requireElectronBridge,
}));

vi.mock('./route-entry', () => ({
  shouldRedirectAuthenticatedDesktopEntry: mocks.shouldRedirectAuthenticatedDesktopEntry,
}));

describe('desktop bootstrapMainApp', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.assign(mocks.app, {
      use: vi.fn(),
      mount: vi.fn(),
    });
    Object.assign(mocks.pinia, {
      use: vi.fn(),
    });
    Object.assign(mocks.router, {
      beforeEach: vi.fn(),
      afterEach: vi.fn(),
      isReady: vi.fn(async () => undefined),
      replace: vi.fn(),
      currentRoute: {
        value: { name: 'home' },
      },
    });
    Object.assign(mocks.authStore, {
      hydrateCloudSession: vi.fn(),
      reset: vi.fn(),
    });
    Object.assign(mocks.accountStore, {
      setCurrentAccount: vi.fn(),
      reset: vi.fn(),
    });
    Object.assign(mocks.notificationHook, {
      start: vi.fn(),
    });
    document.documentElement.lang = '';
    document.title = '';
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: mocks.requestIdleCallback,
    });
  });

  it('bootstraps the desktop renderer and redirects authenticated entrypoints after router readiness', async () => {
    const { bootstrapMainApp } = await import('./app');

    await bootstrapMainApp();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.readDesktopAccessSnapshot).toHaveBeenCalledWith(mocks.bridge);
    expect(mocks.authStore.hydrateCloudSession).toHaveBeenCalledTimes(1);
    expect(mocks.accountStore.setCurrentAccount).toHaveBeenCalledWith({ id: 'cloud-1' });
    expect(document.documentElement.lang).toBe('en-US');
    expect(mocks.createAppRouter).toHaveBeenCalledTimes(1);
    expect(mocks.initElectronFeatures).toHaveBeenCalledWith(mocks.app);
    expect(mocks.app.mount).toHaveBeenCalledWith('#app');
    expect(mocks.notificationHook.start).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).toHaveBeenCalledWith('/');
    // Server-state runtime installed before mount (plan §3.1).
    expect(mocks.installDesktopServerStateRuntime).toHaveBeenCalledWith(mocks.app);
    // Deferred startup is registered with a cancellable handle (P2-3).
    expect(mocks.registerDesktopServerStateStartupCancel).toHaveBeenCalledTimes(1);

    const afterEachHandler = mocks.router.afterEach.mock.calls[0]?.[0];
    expect(afterEachHandler).toBeTypeOf('function');
    afterEachHandler({ meta: { title: 'dashboard.title' } });
    expect(document.title).toBe('Dashboard - MemoFlow');

    afterEachHandler({ meta: { title: 'Desktop Home' } });

    expect(mocks.progressDone).toHaveBeenCalledTimes(2);
    expect(document.title).toBe('Desktop Home - MemoFlow');
  });

  it('keeps a locked Profile on the auth route when cloud hydration fails', async () => {
    mocks.readDesktopAccessSnapshot.mockResolvedValueOnce({ unlockState: 'LOCKED' });
    mocks.getCloudSession.mockResolvedValueOnce({ ok: false });
    mocks.getMyProfile.mockResolvedValueOnce({ ok: false });

    const { bootstrapMainApp } = await import('./app');

    await bootstrapMainApp();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.authStore.reset).toHaveBeenCalledTimes(1);
    expect(mocks.accountStore.reset).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    // auth-only entry (locked profile) must not install the Query Cache (plan §3.1; P2-4).
    expect(mocks.installDesktopServerStateRuntime).not.toHaveBeenCalled();
  });

  it('does not start realtime sources when disposed before the deferred startup fires (P2-3)', async () => {
    mocks.isDesktopServerStateDisposed.mockReturnValueOnce(true);

    const { bootstrapMainApp } = await import('./app');

    await bootstrapMainApp();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.notificationHook.start).not.toHaveBeenCalled();
    // Startup was still scheduled + registered for cancellation (P2-3).
    expect(mocks.registerDesktopServerStateStartupCancel).toHaveBeenCalledTimes(1);
  });
});
