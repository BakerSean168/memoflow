/**
 * @file index.ts
 * @description 账户模块路由配置。定义了账户相关的页面路由，如个人资料、设置、安全中心等。
 * @author Jules (AI)
 */

import type { RouteRecordRaw } from 'vue-router';

/**
 * 账户模块路由表
 */
export const accountRoutes: RouteRecordRaw[] = [
  {
    path: '/account',
    meta: {
      title: 'account.title',
      showInNav: false, // 不在侧边栏显示，通过头像菜单访问
      requiresAuth: true,
    },
    children: [
      {
        path: '',
        redirect: '/account/center',
      },
      {
        // 账户中心已并入设置「账户与隐私」分组（Plan §13）。
        // `?tab=` 查询参数是设置页的分组深链契约。
        path: 'center',
        name: 'account-center',
        redirect: { path: '/settings', query: { tab: 'account' } },
      },
    ],
  },
];
