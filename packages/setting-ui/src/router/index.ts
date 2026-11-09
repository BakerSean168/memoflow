/**
 * Setting 模块路由配置
 */

import type { RouteRecordRaw } from 'vue-router';

export const settingRoutes: RouteRecordRaw[] = [
  {
    path: '/settings',
    name: 'settings',
    /**
     * `/settings` is a deep-link entry to the shell settings dialog, not a
     * full-page scene: the AppShell owns the workspace and opens the dialog,
     * keeping this URL only as the reloadable deep-link address. The dialog's
     * section comes from `?tab=` through the embedded `initialTab` contract.
     */
    meta: {
      title: 'setting.title',
      showInNav: false, // 不在侧边栏显示，通过账户菜单访问
      requiresAuth: true,
    },
    // 新版本使用内部标签导航，不需要子路由
  },
];
