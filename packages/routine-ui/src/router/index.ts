import type { RouteRecordRaw } from 'vue-router';

export const routineRoutes: RouteRecordRaw[] = [
  {
    path: '/routines',
    name: 'RoutineConfiguration',
    component: () => import('../views/RoutineConfigurationView.vue'),
    meta: {
      title: 'routine.title',
      showInNav: true,
      icon: 'lucide:repeat-2',
      order: 3,
      requiresAuth: true,
    },
  },
];
