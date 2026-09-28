/**
 * Repository / Note 模块路由配置。
 *
 * `/repository` is the single Notes workspace entry. Existing-note editing is
 * intentionally absent; Desktop delegates edits to Obsidian and Web remains
 * projection-only.
 */

import type { RouteRecordRaw } from 'vue-router';

export const repositoryRoutes: RouteRecordRaw[] = [
  {
    path: '/repository',
    name: 'repository',
    component: () => import('../views/RepositoryEntryView.vue'),
    meta: {
      title: 'repository.route.workspace',
      showInNav: true,
      icon: 'lucide:notebook-text',
      order: 7,
      requiresAuth: true,
    },
  },
];
