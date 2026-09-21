import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router';
import { createAppAccessGuard } from './guards';
import { createSettingsSceneGuard } from '../layouts/shell/surface-leave-protocol';

import AppShell from '../layouts/shell/AppShell.vue';
import ShellHomeRoute from '../layouts/shell/shell-home-route';

// Module routes
import { accountRoutes } from '../modules/account/router';
import { goalRoutes } from '../modules/goal/router';
import { governanceRoutes } from '../modules/governance/router';
import { taskRoutes } from '../modules/task/router';
import { routineRoutes } from '../modules/routine/router';
import { scheduleRoutes } from '../modules/schedule/router';
import { repositoryRoutes } from '../modules/repository/router';
import { notificationRoutes } from '../modules/notification/router';
import { settingRoutes } from '../modules/setting/router';
import { aiRoutes } from '../modules/ai/router';

export function createAppRouter(options?: {
  history?: RouterHistory;
  canAccessApp?: () => boolean;
  loginRoute?: string;
  authView?: RouteRecordRaw['component'];
  additionalRoutes?: RouteRecordRaw[];
  additionalTopLevelRoutes?: RouteRecordRaw[];
}) {
  const {
    history = createWebHistory(),
    canAccessApp,
    loginRoute,
    authView,
    additionalRoutes = [],
    additionalTopLevelRoutes = [],
  } = options ?? {};

  const routes: RouteRecordRaw[] = [
    ...additionalTopLevelRoutes,
    {
      path: '/auth',
      name: 'auth',
      component: authView ?? (() => import('../views/AuthPlatformEntry.vue')),
      meta: { requiresAuth: false, layout: 'auth' },
    },
    {
      path: '/',
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        {
          // STATE A（纯 AI 态）：AI 工作区是壳常驻层，此路由不渲染内容（V2 §2.1）。
          path: '',
          name: 'ai-workspace',
          component: ShellHomeRoute,
          meta: { title: 'aiAssistant.chatPage.title' },
        },
        // Module routes
        ...accountRoutes,
        ...goalRoutes,
        ...governanceRoutes,
        ...taskRoutes,
        ...routineRoutes,
        ...scheduleRoutes,
        ...repositoryRoutes,
        ...notificationRoutes,
        ...aiRoutes,
        ...settingRoutes,
        // Host-provided additional routes
        ...additionalRoutes,
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ];

  const router = createRouter({
    history,
    routes,
  });

  router.beforeEach(createAppAccessGuard({ canAccessApp, accessEntryRoute: loginRoute }));
  router.beforeEach(createSettingsSceneGuard());

  return router;
}

export * from './guards';
