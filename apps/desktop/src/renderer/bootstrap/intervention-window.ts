import { createApp } from 'vue';
import InterventionWindowApp from '../intervention-window/InterventionWindowApp.vue';
import { installWindowI18n } from './window-i18n';

export async function bootstrapInterventionWindow(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('InterventionWindow root #app is missing');
  // The intervention surface is always dark; the class makes the shared design
  // tokens resolve to the same values the main shell uses in dark mode.
  document.documentElement.classList.add('dark');
  document.documentElement.dataset.theme = 'dark';
  const app = createApp(InterventionWindowApp);
  await installWindowI18n(app);
  app.mount(root);
}
