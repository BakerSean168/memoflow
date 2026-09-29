/**
 * Governance module routes.
 *
 * Governance remains independently routable at `/governance/**`; it is not a
 * secondary segment inside the Notes / Repository workspace.
 */

import { RouterView, type RouteRecordRaw } from 'vue-router';
import { governanceSurfacePolicy } from '../governance-surface-policy';

export const governanceRoutes: RouteRecordRaw[] = [
  {
    path: '/governance',
    component: RouterView,
    meta: {
      title: 'governance.route.ruleList',
      showInNav: governanceSurfacePolicy.navigationVisible,
      icon: 'mdi-shield-check',
      order: 8,
      requiresAuth: true,
    },
    children: [
      {
        path: '',
        name: 'governance-list',
        component: () => import('../views/GovernanceListView.vue'),
        meta: {
          title: 'governance.route.ruleList',
          requiresAuth: true,
        },
      },
      {
        path: 'new',
        name: 'governance-editor',
        component: () => import('../views/RuleEditorView.vue'),
        meta: {
          title: 'governance.route.newRule',
          requiresAuth: true,
        },
      },
      {
        path: ':id/edit',
        name: 'governance-editor-edit',
        component: () => import('../views/RuleEditorView.vue'),
        meta: {
          title: 'governance.route.editRule',
          requiresAuth: true,
        },
        props: true,
      },
      {
        path: ':id',
        name: 'governance-detail',
        component: () => import('../views/GovernanceDetailView.vue'),
        meta: {
          title: 'governance.route.ruleDetail',
          requiresAuth: true,
        },
        props: true,
      },
      {
        path: ':id/history',
        name: 'governance-history',
        component: () => import('../views/RevisionHistoryView.vue'),
        meta: {
          title: 'governance.route.revisionHistory',
          requiresAuth: true,
        },
        props: true,
      },
    ],
  },
];
