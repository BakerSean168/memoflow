import type { RouteRecordRaw } from 'vue-router';
const goalDetail = () => import('../views/GoalDetailView.vue');
export const goalRoutes: RouteRecordRaw[] = [
  {
    path: '/goals',
    name: 'goals',
    meta: {
      title: 'goal.route.management',
      showInNav: true,
      icon: 'mdi-target',
      order: 3,
      requiresAuth: true,
    },
    component: () => import('../views/GoalModuleLayout.vue'),
    children: [
      {
        path: '',
        name: 'goal-list',
        component: () => import('../views/GoalListView.vue'),
        meta: { title: 'goal.route.list', requiresAuth: true },
      },
      {
        path: ':id',
        name: 'goal-detail',
        component: goalDetail,
        meta: { title: 'goal.route.detail', requiresAuth: true },
        props: false,
      },
      {
        path: ':goalId/review/create',
        name: 'goal-review-create',
        component: () => import('../views/GoalReviewCreationView.vue'),
        meta: { title: 'goal.route.createReview', requiresAuth: true },
        props: true,
      },
      {
        path: ':goalId/review/:reviewId',
        name: 'goal-review-detail',
        component: () => import('../views/GoalReviewDetailView.vue'),
        meta: { title: 'goal.route.reviewDetail', requiresAuth: true },
        props: true,
      },
      {
        path: ':goalId/key-results/:keyResultId',
        name: 'key-result-detail',
        component: goalDetail,
        meta: { title: 'goal.route.krDetail', requiresAuth: true },
        props: false,
      },
    ],
  },
];
