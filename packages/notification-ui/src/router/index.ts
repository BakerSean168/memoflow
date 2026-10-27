/**
 * Notification 模块路由配置
 *
 * NOTE: The SSE monitor route uses `import.meta.env.DEV` which is Vite-specific.
 * This only works correctly in Vite-based host applications.
 */

import type { RouteRecordRaw } from 'vue-router';

export const notificationRoutes: RouteRecordRaw[] = [
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('../views/NotificationListPage.vue'),
    meta: {
      title: 'notification.title',
      showInNav: true,
      icon: 'mdi-bell',
      order: 7,
      requiresAuth: true,
    },
  },
  {
    path: '/sse-monitor',
    name: 'sse-monitor',
    component: () => import('../views/SSEMonitorPage.vue'),
    meta: {
      title: 'notification.sseMonitor.title',
      showInNav: import.meta.env.DEV, // 仅开发环境显示
      icon: 'mdi-radio-tower',
      order: 999,
      requiresAuth: true,
    },
  },
];
