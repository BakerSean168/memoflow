import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { createWebHashHistory } from 'vue-router';
import { APP_TITLE_NAME } from '@memoflow/assets';
import { createAppRouter } from '@memoflow/app-vue/router';
import {
  createI18nPlugin,
  loadLocaleMessages,
  translateMessageKey,
} from '@memoflow/app-vue/plugins/i18n';
import { readDesktopAccessSnapshot } from '@memoflow/app-vue/desktop';
import {
  createNotificationStartupHook,
  createNotificationClickNavigation,
} from '@memoflow/app-vue/modules/notification';
import { usePresentationPreferenceStore } from '@memoflow/app-vue/modules/setting';
import { useAuthenticationStore } from '@memoflow/app-vue/modules/authentication';
import { useAccountStore } from '@memoflow/app-vue/modules/account';
import { progressStart, progressDone } from '@memoflow/ui-vue-shadcn/composables/useProgressBar';

import App from '../App.vue';
import { installDesktopAppServices } from '../platform/di-app';
// Residual 941: host bridge via getElectronBridge sole helper.
import { requireElectronBridge } from '../platform/electron-bridge';
import { initElectronFeatures } from '../platform/electron';
import {
  getDesktopServerStateRuntime,
  installDesktopServerStateRuntime,
  isDesktopServerStateDisposed,
  registerDesktopServerStateSource,
  registerDesktopServerStateStartupCancel,
} from '../platform/server-state';
import { shouldRedirectAuthenticatedDesktopEntry } from './route-entry';
import { createCloudAuthIpcClient } from '@memoflow/cloud-auth';
import { createResultIpcClient } from '@memoflow/ipc-client';
import { createAccountIpcClient } from '@memoflow/account/client';

export async function bootstrapMainApp() {
  const app = createApp(App);

  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  app.use(pinia);

  const presentationStore = usePresentationPreferenceStore();
  document.documentElement.lang = presentationStore.locale;

  const localeMessages = await loadLocaleMessages(presentationStore.locale);
  app.use(createI18nPlugin(presentationStore.locale, localeMessages));

  const bridge = requireElectronBridge('bootstrapMainApp');
  const desktopAccessSnapshot = await readDesktopAccessSnapshot(bridge);
  const authStore = useAuthenticationStore();
  const cloudSession = await createCloudAuthIpcClient(
    createResultIpcClient({ bridge }),
  ).getSession();
  if (cloudSession.ok) authStore.hydrateCloudSession(cloudSession.data);
  else authStore.reset();
  const accountStore = useAccountStore();
  const localAccount = await createAccountIpcClient(
    createResultIpcClient({ bridge }),
  ).getMyProfile();
  if (localAccount.ok) accountStore.setCurrentAccount(localAccount.data.account.toDTO());
  else accountStore.reset();

  const router = createAppRouter({
    history: createWebHashHistory(),
    canAccessApp: () => desktopAccessSnapshot?.unlockState === 'UNLOCKED',
    additionalTopLevelRoutes: [
      {
        path: '/custom-notification',
        name: 'custom-notification',
        component: () => import('../CustomNotificationView.vue'),
        meta: { requiresAuth: false, layout: 'empty' },
      },
    ],
  });

  router.beforeEach(() => {
    progressStart();
  });

  router.afterEach((to) => {
    progressDone();
    const titleKey = to.meta.title as string | undefined;
    const title = titleKey ? translateMessageKey(titleKey) : undefined;
    document.title = title ? `${title} - ${APP_TITLE_NAME}` : APP_TITLE_NAME;
  });

  // 已认证 renderer：mount 前创建/安装 server-state runtime（§3.1；desktop lane 走 PowerSync/IPC）。
  // auth-only entry（profile 锁定）不安装 Query Cache（plan §3.1 认证后安装；P2-4）。
  if (desktopAccessSnapshot?.unlockState === 'UNLOCKED') {
    installDesktopServerStateRuntime(app);
  }

  app.use(router);
  app.use(installDesktopAppServices);
  initElectronFeatures(app);
  app.mount('#app');

  const runStartupPhase = () => {
    if (isDesktopServerStateDisposed()) return;
    try {
      // 实时源只向 dispatcher 发 invalidation intent（Step 3）；Desktop 不启用 cloud SSE。
      const runtime = getDesktopServerStateRuntime();
      const identityScope = () => accountStore.getCurrentAccountId ?? '';
      if (runtime) {
        const notificationHook = createNotificationStartupHook({
          dispatcher: runtime.dispatcher,
          identityScope,
        });
        notificationHook.start();
        registerDesktopServerStateSource(notificationHook);
      }
      // R3 收尾：桌面通知点击 → 稳定导航（navigationIntent / category landing）。
      createNotificationClickNavigation(router, () => bridge).start();
    } catch (error) {
      console.error('[desktop] APP_STARTUP phase failed', error);
    }
  };

  // Deferred startup is lifecycle-guarded and cancellable: a logout/profile lock that runs
  // before it fires must not start realtime sources after cleanup (plan §3.1 ordering; P2-3).
  // 延迟启动带生命周期守卫且可取消：若登出/锁屏先于其执行，不得在清理后启动实时源（P2-3）。
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const handle = window.requestIdleCallback(runStartupPhase, { timeout: 3000 });
    registerDesktopServerStateStartupCancel(() => window.cancelIdleCallback(handle));
  } else {
    const handle = globalThis.setTimeout(runStartupPhase, 0);
    registerDesktopServerStateStartupCancel(() => globalThis.clearTimeout(handle));
  }

  void router.isReady().then(() => {
    if (desktopAccessSnapshot?.unlockState !== 'UNLOCKED') {
      return;
    }

    if (!shouldRedirectAuthenticatedDesktopEntry(router.currentRoute.value.name)) {
      return;
    }

    void router.replace('/');
  });
}
