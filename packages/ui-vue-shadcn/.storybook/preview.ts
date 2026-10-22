import { setup, type Preview } from '@storybook/vue3-vite';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { productionLocaleMessages } from '../../app-vue/src/locales/production-messages';
import { installServerStateRuntime } from '../../app-vue/src/platform/server-state';
import '../src/styles/globals.css';

setup((app) => {
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }));
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] }));
  installServerStateRuntime(app, 'web', { identityScope: 'storybook' });
});

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  },
  tags: ['autodocs'],
};
export default preview;
