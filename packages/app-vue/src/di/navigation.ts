/**
 * Default Navigation Configuration (UI 重构 V2)
 *
 * V2 壳的导航 = WindowHeader 的 6 个复合模块胶囊 + 侧栏底部设置入口。
 * 宿主应用可通过 MODULE_CAPSULES_KEY 覆写胶囊清单。
 *
 * V1 的分组侧栏导航（defaultMainNavigation / defaultBottomNavigation）
 * 已随 MainLayout 在 S1 切换时移除（UI_REDESIGN_V2_PLAN §1.2）。
 *
 * @module di/navigation
 */

import { Bell, Calendar, FileText, ListTodo, Target } from '@lucide/vue';
import type { ModuleCapsule } from './types';

/**
 * V2 shell module capsules (WindowHeader center).
 *
 * Six business modules surfaced as compound top-of-window capsules. Schedule
 * and Notification use the utility placement in WindowHeader; all entries
 * still share this registry so host overrides remain authoritative.
 *
 * `route` is the panel landing route; `badgeSource` is a semantic token the
 * shell resolves to a count (S1 wires notification unread only).
 */
export const defaultModuleCapsules: ModuleCapsule[] = [
  { id: 'goal', title: 'nav.capsule.goal', icon: Target, route: '/goals' },
  { id: 'task', title: 'nav.capsule.task', icon: ListTodo, route: '/tasks' },
  { id: 'note', title: 'nav.capsule.note', icon: FileText, route: '/repository' },
  { id: 'schedule', title: 'nav.schedule', icon: Calendar, route: '/schedule' },
  {
    id: 'notification',
    title: 'nav.capsule.notification',
    icon: Bell,
    route: '/notifications',
    badgeSource: 'notification.unread',
  },
];
