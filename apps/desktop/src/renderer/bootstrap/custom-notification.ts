import { createApp } from 'vue';
import CustomNotificationView from '../CustomNotificationView.vue';

export async function bootstrapCustomNotification(): Promise<void> {
  const root = document.querySelector('#app');
  if (!root) throw new Error('Custom notification root #app is missing');
  createApp(CustomNotificationView).mount(root);
}
