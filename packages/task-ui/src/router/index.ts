/**
 * Task 模块路由配置
 */

import type { RouteRecordRaw } from 'vue-router';

export const taskRoutes: RouteRecordRaw[] = [
  {
    path: '/tasks',
    name: 'tasks',
    meta: {
      title: 'task.route.management',
      showInNav: true,
      icon: 'mdi-check-circle',
      order: 2,
      requiresAuth: true,
    },
    children: [
      {
        path: '',
        name: 'task-list',
        component: () => import('../views/TaskManagementView.vue'),
        meta: {
          title: 'task.route.management',
          requiresAuth: true,
        },
      },
      {
        path: ':id',
        name: 'task-detail',
        component: () => import('../views/TaskDetailView.vue'),
        meta: {
          title: 'task.route.detail',
          requiresAuth: true,
        },
        props: true,
      },
    ],
  },
];
