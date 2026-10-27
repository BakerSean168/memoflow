/**
 * Setting 模块路由配置
 */

import type { RouteRecordRaw } from 'vue-router';

export const settingRoutes: RouteRecordRaw[] = [
  {
    path: '/settings',
    name: 'settings',
    /**
     * 独立设置场景（STATE D）使用 named view `settings`：
     * AppShell 的 WorkspaceSceneHost（default router-view）与 SettingsSceneHost
     * （`<router-view name="settings" />`）常驻并存——设置路由时不渲染业务
     * default view，但 workspace 子树（KeepAlive 实例 / AIChatView / Teleport
     * 宿主）不卸载，AI 流与业务草稿保持（Phase 0 / 诊断 UI-001）。
     */
    components: { settings: () => import('../views/UserSettingsView.vue') },
    meta: {
      title: 'setting.title',
      showInNav: false, // 不在侧边栏显示，通过账户菜单访问
      requiresAuth: true,
      /** 独立设置场景（STATE D）；AppShell 按此切换外壳，不进 BusinessPanel。 */
      shellScene: 'settings',
    },
    // 新版本使用内部标签导航，不需要子路由
  },
];
