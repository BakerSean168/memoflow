import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  };
  const notificationHook = {
    start: vi.fn(),
  };
  const serverStateRuntime = {
    queryClient: {},
    dispatcher: { invalidate: vi.fn(async () => undefined) },
    dispose: vi.fn(),
    clearIdentity: vi.fn(),
  };
  const sseSource = {
    start: vi.fn(),
    stop: vi.fn(),
  };
  const authStore = {
    isAuthenticated: true,
    getIdentityId: 'cloud-1',
    setIsInitializing: vi.fn(),
    hydrateCloudSession: vi.fn(),
    reset: vi.fn(),
  };

  return {
    app,
    pinia,
    router,
    notificationHook,
    serverStateRuntime,
    sseSource,
    authStore,
    createApp: vi.fn(() => app),
    createPinia: vi.fn(() => pinia),
    createAppRouter: vi.fn(() => router),
    useAuthenticationStore: vi.fn(() => authStore),
    getSession: vi.fn(async () => ({
      ok: true,
      data: { account: { id: 'cloud-1' }, session: { id: 'session-1' } },
    })),
    usePresentationPreferenceStore: vi.fn(() => ({ theme: 'dark', locale: 'zh-CN' })),
    applyThemeMode: vi.fn(),
    createNotificationStartupHook: vi.fn(() => notificationHook),
    installWebServerStateRuntime: vi.fn(() => serverStateRuntime),
    getWebServerStateRuntime: vi.fn(() => serverStateRuntime),
    registerWebServerStateSource: vi.fn(),
    isWebServerStateDisposed: vi.fn(() => false),
    registerWebServerStateStartupCancel: vi.fn(),
    createNotificationSseInvalidationSource: vi.fn(() => sseSource),
    createI18nPlugin: vi.fn(() => ({ name: 'i18n-plugin' })),
    loadLocaleMessages: vi.fn(async () => ({ hello: 'world' })),
    translateMessageKey: vi.fn((key: string) =>
      key === 'aiAssistant.chatPage.title' ? 'AI Workspace' : key,
    ),
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

vi.mock('pinia', () => ({
  createPinia: mocks.createPinia,
}));

vi.mock('pinia-plugin-persistedstate', () => ({
  default: 'persisted-plugin',
}));

vi.mock('@memoflow/assets', () => ({
  APP_TITLE_NAME: 'MemoFlow',
}));

vi.mock('@memoflow/app-vue/web-bootstrap', () => ({
  createAppRouter: mocks.createAppRouter,
  useAuthenticationStore: mocks.useAuthenticationStore,
  applyThemeMode: mocks.applyThemeMode,
  usePresentationPreferenceStore: mocks.usePresentationPreferenceStore,
}));

vi.mock('@memoflow/app-vue', () => ({
  createNotificationStartupHook: mocks.createNotificationStartupHook,
  createNotificationSseInvalidationSource: mocks.createNotificationSseInvalidationSource,
}));

vi.mock('@memoflow/cloud-auth', () => ({
  createCloudAuthHttpClient: vi.fn(() => ({ getSession: mocks.getSession })),
}));

vi.mock('@memoflow/app-vue/web-i18n', () => ({
  createI18nPlugin: mocks.createI18nPlugin,
  loadLocaleMessages: mocks.loadLocaleMessages,
  translateMessageKey: mocks.translateMessageKey,
}));

vi.mock('@memoflow/ui-vue-shadcn/composables/useProgressBar', () => ({
  progressStart: mocks.progressStart,
  progressDone: mocks.progressDone,
}));

vi.mock('../App.vue', () => ({
  default: { name: 'WebAppRoot' },
}));

vi.mock('../platform/di-app', () => ({
  installAppServices: { name: 'install-app-services' },
}));

vi.mock('../platform/server-state', () => ({
  installWebServerStateRuntime: mocks.installWebServerStateRuntime,
  getWebServerStateRuntime: mocks.getWebServerStateRuntime,
  registerWebServerStateSource: mocks.registerWebServerStateSource,
  isWebServerStateDisposed: mocks.isWebServerStateDisposed,
  registerWebServerStateStartupCancel: mocks.registerWebServerStateStartupCancel,
}));

describe('bootstrapMainApp', () => {
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
    });
    Object.assign(mocks.notificationHook, {
      start: vi.fn(),
    });
    Object.assign(mocks.authStore, {
      isAuthenticated: true,
      setIsInitializing: vi.fn(),
      hydrateCloudSession: vi.fn(),
      reset: vi.fn(),
    });
    document.documentElement.lang = '';
    document.title = '';
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: mocks.requestIdleCallback,
    });
  });

  afterEach(() => {
    delete (window as Window & { requestIdleCallback?: IdleRequestCallback }).requestIdleCallback;
  });

  it('bootstraps the web app and schedules startup hooks through requestIdleCallback', async () => {
    const { bootstrapMainApp } = await import('./app');

    await bootstrapMainApp();

    expect(mocks.createApp).toHaveBeenCalledTimes(1);
    expect(mocks.createPinia).toHaveBeenCalledTimes(1);
    expect(mocks.pinia.use).toHaveBeenCalledWith('persisted-plugin');
    expect(mocks.applyThemeMode).toHaveBeenCalledWith('dark');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(mocks.loadLocaleMessages).toHaveBeenCalledWith('zh-CN');
    expect(mocks.createI18nPlugin).toHaveBeenCalledWith('zh-CN', { hello: 'world' });
    expect(mocks.createAppRouter).toHaveBeenCalledTimes(1);
    expect(mocks.authStore.setIsInitializing).toHaveBeenCalledWith(true);
    expect(mocks.authStore.hydrateCloudSession).toHaveBeenCalledTimes(1);
    expect(mocks.app.mount).toHaveBeenCalledWith('#app');
    expect(mocks.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(mocks.notificationHook.start).toHaveBeenCalledTimes(1);
    // Server-state runtime installed after identity is known (plan §3.1/§3.6).
    expect(mocks.installWebServerStateRuntime).toHaveBeenCalledWith(mocks.app);
    // Web-only SSE invalidation source started alongside the eventBus hook (Step 3).
    expect(mocks.createNotificationSseInvalidationSource).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/api/v1/notifications/sse'),
      }),
    );
    expect(mocks.sseSource.start).toHaveBeenCalledTimes(1);

    // Deferred startup is registered with a cancellable handle (P2-5).
    expect(mocks.registerWebServerStateStartupCancel).toHaveBeenCalledTimes(1);

    // SSE cursor is scoped by identity (P2-5): writing under the identity key round-trips.
    const sseOptions = mocks.createNotificationSseInvalidationSource.mock.calls[0]?.[0] as {
      cursorStore: { get(): string | undefined; set(cursor: string): void };
    };
    const identityCursorKey = `memoflow:notifications:sse-cursor:${mocks.authStore.getIdentityId ?? ''}`;
    sseOptions.cursorStore.set('cursor-1');
    expect(localStorage.getItem(identityCursorKey)).toBe('cursor-1');
    expect(sseOptions.cursorStore.get()).toBe('cursor-1');
    localStorage.removeItem(identityCursorKey);

    const afterEachHandler = mocks.router.afterEach.mock.calls[0]?.[0];
    expect(afterEachHandler).toBeTypeOf('function');
    afterEachHandler({ meta: { title: 'aiAssistant.chatPage.title' } });
    expect(document.title).toBe('AI Workspace - MemoFlow');

    afterEachHandler({ meta: { title: 'Inbox' } });

    expect(mocks.progressDone).toHaveBeenCalledTimes(2);
    expect(document.title).toBe('Inbox - MemoFlow');
  }, 15_000);

  it('does not install the server-state runtime when the cloud session fails', async () => {
    mocks.getSession.mockResolvedValueOnce({ ok: false });

    const { bootstrapMainApp } = await import('./app');
    await bootstrapMainApp();

    expect(mocks.authStore.reset).toHaveBeenCalledTimes(1);
    expect(mocks.installWebServerStateRuntime).not.toHaveBeenCalled();
  }, 15_000);
});
