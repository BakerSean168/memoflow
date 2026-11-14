import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { NOTIFICATION_SERVICE_KEY } from '@notification-ui-test-host/di/keys';
import type { NotificationClientPort } from '@memoflow/notification-client';
import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import NotificationCapsulePreview from './NotificationCapsulePreview.vue';

const now = Date.now();
const minutesAgo = new Date(now - 12 * 60_000).toISOString();
const hourAgo = new Date(now - 3_600_000).toISOString();
const dayAgo = new Date(now - 86_400_000).toISOString();

function mockNotification(overrides: Record<string, unknown> = {}): NotificationClientDTO {
  return {
    id: 'notification-1',
    identityId: 'identity-1',
    title: '任务即将到期',
    content: '「完成季度架构评审材料」将在 2 小时后到期。',
    type: 'Task',
    category: 'Task',
    importance: 'Important',
    isRead: false,
    readAt: null,
    status: 'Delivered',
    actions: null,
    metadata: null,
    version: 1,
    createdAt: hourAgo,
    updatedAt: hourAgo,
    deletedAt: null,
    notificationChannels: null,
    ...overrides,
  } as unknown as NotificationClientDTO;
}

const overviewActions = [
  {
    kind: 'owner-command',
    actionKey: 'complete',
    commandKey: 'routine.complete',
    labelKey: 'notification.action.complete',
    owner: { type: 'routine', id: 'routine-1' },
  },
  {
    kind: 'owner-command',
    actionKey: 'snooze',
    commandKey: 'routine.snooze',
    labelKey: 'notification.action.snooze10m',
    owner: { type: 'routine', id: 'routine-1' },
  },
];

const notifications = [
  mockNotification({
    id: 'notification-1',
    title: '起身活动提醒',
    content: '已经连续久坐 50 分钟，起来走走吧。',
    type: 'Reminder',
    category: 'Reminder',
    importance: 'Moderate',
    createdAt: minutesAgo,
    updatedAt: minutesAgo,
    actions: overviewActions,
  }),
  mockNotification({ id: 'notification-2', createdAt: hourAgo, updatedAt: hourAgo }),
  mockNotification({
    id: 'notification-3',
    title: '目标进度里程碑',
    content: '恭喜！年度目标「技术能力提升」已达成 90%。',
    type: 'Goal',
    category: 'Goal',
    importance: 'Moderate',
    isRead: true,
    readAt: hourAgo,
    status: 'Read',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  }),
  mockNotification({
    id: 'notification-4',
    title: '系统升级完成',
    content: 'MemoFlow v0.23.0 已成功部署，包含多项性能优化。',
    type: 'System',
    category: 'System',
    importance: 'Minor',
    isRead: true,
    readAt: dayAgo,
    status: 'Read',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  }),
];

function serviceWith(items: NotificationClientDTO[], unread: number): NotificationClientPort {
  return {
    findNotifications: async () => ({
      ok: true,
      data: {
        notifications: items,
        total: items.length,
        page: 1,
        pageSize: 10,
        hasMore: false,
      },
    }),
    getUnreadCount: async () => ({ ok: true, data: { count: unread } }),
    markAllAsRead: async () => ({ ok: true, data: { count: unread } }),
    markAsRead: async (id: string) => ({
      ok: true,
      data: items.find((item) => String(item.id) === id) ?? items[0],
    }),
    executeAction: async () => ({
      ok: true,
      data: {
        interaction: {
          id: 'interaction-1',
          idempotencyKey: 'interaction-key',
          identityId: 'identity-1',
          notificationId: 'notification-1',
          actionKey: 'complete',
          actionKind: 'owner-command',
          occurredAt: now,
          outcome: 'accepted',
        },
        action: overviewActions[0],
      },
    }),
  } as unknown as NotificationClientPort;
}

function renderWith(items: NotificationClientDTO[], unread: number) {
  return {
    components: { NotificationCapsulePreview },
    setup() {
      provide(NOTIFICATION_SERVICE_KEY, serviceWith(items, unread));
      return {};
    },
    template:
      '<div style="width: 360px; padding: 1rem; background: hsl(var(--workspace-business));"><NotificationCapsulePreview /></div>',
  };
}

const meta = {
  title: 'Business/Notification/NotificationCapsulePreview',
  component: NotificationCapsulePreview,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof NotificationCapsulePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWith(notifications, 2),
};

export const AllRead: Story = {
  render: () =>
    renderWith(
      notifications.map(
        (item) =>
          ({
            ...item,
            isRead: true,
            readAt: hourAgo,
            status: 'Read',
          }) as unknown as NotificationClientDTO,
      ),
      0,
    ),
};

export const Empty: Story = {
  render: () => renderWith([], 0),
};

export const LongContent: Story = {
  render: () =>
    renderWith(
      [
        mockNotification({
          id: 'notification-long',
          title: '周报汇总：本周完成事项与下周计划',
          content:
            '本周完成了事件契约评审、可靠性验证和三个交付面的回归；下周计划补充死信队列告警阈值，并完成架构文档的最终校对与发布。',
          createdAt: minutesAgo,
          updatedAt: minutesAgo,
        }),
      ],
      1,
    ),
};
