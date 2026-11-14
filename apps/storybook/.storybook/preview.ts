/* eslint-disable @nx/enforce-module-boundaries -- Storybook config imports workspace helpers and packages */
import { installAccountUiHost } from '../../../packages/app-vue/src/di/account-ui-host';
import { installAiUiHost } from '../../../packages/app-vue/src/di/ai-ui-host';
import { installGoalUiHost } from '../../../packages/app-vue/src/di/goal-ui-host';
import { installNotificationUiHost } from '../../../packages/app-vue/src/di/notification-ui-host';
import { installSettingUiHost } from '../../../packages/app-vue/src/di/setting-ui-host';
import { installTaskUiHost } from '../../../packages/app-vue/src/di/task-ui-host';
import { installRepositoryUiHost } from '../../../packages/app-vue/src/di/repository-ui-host';
import { installRoutineUiHost } from '../../../packages/app-vue/src/di/routine-ui-host';
import { installScheduleUiHost } from '../../../packages/app-vue/src/di/schedule-ui-host';
import { ACCENT_VALUES } from '../../../packages/setting-contracts/src/preferences/canonical';
import { setup, type Decorator, type Preview } from '@storybook/vue3-vite';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { productionLocaleMessages } from '../../../packages/app-vue/src/locales/production-messages';
import { installServerStateRuntime } from '../../../packages/app-vue/src/platform/server-state';
import '../../../packages/ui-vue-shadcn/src/styles/globals.css';

setup((app) => {
  installAccountUiHost();
  installAiUiHost();
  installGoalUiHost();
  installNotificationUiHost();
  installSettingUiHost();
  installTaskUiHost();
  installRepositoryUiHost();
  installRoutineUiHost();
  installScheduleUiHost();
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

// Accent review follows the production mechanism: ui-core reads `data-accent`
// on the document root, so the toolbar only writes that attribute (#909).
const withAccentTheme: Decorator = (story, context) => {
  document.documentElement.dataset.accent = context.globals.accent ?? 'brand-gold';
  return story();
};

const preview: Preview = {
  globalTypes: {
    accent: {
      description: 'Accent token set',
      defaultValue: 'brand-gold',
      toolbar: {
        icon: 'paintbrush',
        items: ACCENT_VALUES.map((accent) => ({
          value: accent,
          title: accent
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' '),
        })),
        dynamicTitle: true,
      },
    },
  },
  decorators: [withAccentTheme],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  },
  tags: ['autodocs'],
};
export default preview;
