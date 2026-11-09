/**
 * Setting 模块路由配置
 */

import { defineComponent } from 'vue';
import type { RouteRecordRaw } from 'vue-router';

/**
 * `/settings` renders nothing itself: the AppShell keeps the workspace mounted and
 * opens the settings dialog from the route. The component exists only to satisfy
 * a valid leaf route record.
 */
const SettingsDialogDeepLinkRoute = defineComponent({
  name: 'SettingsDialogDeepLinkRoute',
  render: () => null,
});

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
    component: SettingsDialogDeepLinkRoute,
    meta: {
      title: 'setting.title',
      showInNav: false, // 不在侧边栏显示，通过账户菜单访问
      requiresAuth: true,
    },
    // 新版本使用内部标签导航，不需要子路由
  },
];
