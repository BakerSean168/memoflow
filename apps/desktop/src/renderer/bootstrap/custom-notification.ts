import { createApp } from 'vue';
import CustomNotificationView from '../CustomNotificationView.vue';
import { installWindowI18n } from './window-i18n';

export async function bootstrapCustomNotification(): Promise<void> {
  const root = document.querySelector('#app');
  if (!root) throw new Error('Custom notification root #app is missing');
  // The notification card is always dark; the class makes the shared design
  // tokens resolve to the same values the main shell uses in dark mode.
  document.documentElement.classList.add('dark');
  document.documentElement.dataset.theme = 'dark';
  const app = createApp(CustomNotificationView);
  await installWindowI18n(app);
  app.mount(root);
}
