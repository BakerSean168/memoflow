/* eslint-disable @nx/enforce-module-boundaries -- Storybook config imports workspace helpers and packages */
import { installAiUiHost } from '../../../packages/app-vue/src/di/ai-ui-host';
import { installGoalUiHost } from '../../../packages/app-vue/src/di/goal-ui-host';
import { installNotificationUiHost } from '../../../packages/app-vue/src/di/notification-ui-host';
import { installSettingUiHost } from '../../../packages/app-vue/src/di/setting-ui-host';
import { installTaskUiHost } from '../../../packages/app-vue/src/di/task-ui-host';
import { installRepositoryUiHost } from '../../../packages/app-vue/src/di/repository-ui-host';
import { setup, type Preview } from '@storybook/vue3-vite';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { productionLocaleMessages } from '../../../packages/app-vue/src/locales/production-messages';
import { installServerStateRuntime } from '../../../packages/app-vue/src/platform/server-state';
import '../../../packages/ui-vue-shadcn/src/styles/globals.css';

setup((app) => {
  installAiUiHost();
  installGoalUiHost();
  installNotificationUiHost();
  installSettingUiHost();
  installTaskUiHost();
  installRepositoryUiHost();
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }));
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    }),
  );
  installServerStateRuntime(app, 'web', { identityScope: 'storybook' });
});

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  },
  tags: ['autodocs'],
};
export default preview;
