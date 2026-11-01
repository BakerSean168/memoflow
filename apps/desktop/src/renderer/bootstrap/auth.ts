import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { APP_TITLE_NAME } from '@memoflow/assets';
import {
  createI18nPlugin,
  loadLocaleMessages,
  translateMessageKey,
} from '@memoflow/app-vue/plugins/i18n';

import DesktopAuthApp from '../DesktopAuthApp.vue';
import { installDesktopAuthServices } from '../platform/di-auth';
import { requireElectronBridge } from '../platform/electron-bridge';
import { registerSystemNotice } from '../platform/system-notice';

export async function bootstrapAuthApp() {
  // The identity window is fixed dark whatever the workspace theme is: the
  // class applies the shared dark tokens to the window and its teleported
  // overlays (confirm dialog, toasts).
  document.documentElement.classList.add('dark');
  document.documentElement.dataset.theme = 'dark';

  const app = createApp(DesktopAuthApp);

  app.use(createPinia());
  const localeMessages = await loadLocaleMessages('zh-CN');
  app.use(createI18nPlugin('zh-CN', localeMessages));
  app.use(installDesktopAuthServices);

  app.mount('#app');
  // Profile Access renders the same shell toast host; flush startup notices there too.
  registerSystemNotice(requireElectronBridge('bootstrapAuthApp'), translateMessageKey);
  document.title = APP_TITLE_NAME;
}
