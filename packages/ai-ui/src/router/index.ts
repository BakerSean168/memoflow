import type { RouteRecordRaw } from 'vue-router';

/**
 * `/ai/chat` 曾与 `/` 渲染同一个 AIChatView（双首页，Brief §8-P1）。
 * 现在 `/` 是唯一 AI 工作台入口；本路由保留做深链兼容并重定向。
 */
export const aiRoutes: RouteRecordRaw[] = [
  {
    path: '/ai/chat',
    name: 'ai-chat',
    redirect: '/',
  },
];
