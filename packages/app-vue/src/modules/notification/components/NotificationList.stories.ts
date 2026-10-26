import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NotificationList from './NotificationList.vue';
import type { NotificationClientDTO } from '@memoflow/notification-contracts';

const now = new Date().toISOString();
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const dayAgo = new Date(Date.now() - 86400_000).toISOString();

function mockNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    identityId: 'user-1',
    title: '通知',
    content: '这是一条通知内容。',
    type: 'SYSTEM',
    category: 'System',
    importance: 'Moderate',
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

const meta = {
  title: 'Business/Notification/NotificationList',
  component: NotificationList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 540px;"><story /></div>' })],
  argTypes: {
    notifications: { description: '通知列表数据' },
    loading: { description: '加载状态', control: 'boolean' },
  },
} satisfies Meta<typeof NotificationList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    notifications: [
      mockNotification({
        id: '1',
        title: '紧急：生产环境告警',
        content: 'API 响应时间超过阈值，请立即检查。',
        type: 'SYSTEM',
        importance: 'Vital',
        createdAt: now,
      }),
      mockNotification({
        id: '2',
        title: '任务即将到期',
        content: '「编写 API 指南」将在 2 小时后到期。',
        type: 'TASK',
        category: 'Task',
        importance: 'Important',
        createdAt: hourAgo,
      }),
      mockNotification({
        id: '3',
        title: '目标进度',
        content: '目标「Q4 KPI 达标」已完成 60%。',
        type: 'GOAL',
        category: 'Goal',
        importance: 'Moderate',
        createdAt: hourAgo,
      }),
      mockNotification({
        id: '4',
        title: '日程提醒',
        content: '30 分钟后有「Sprint 规划会」。',
        type: 'REMINDER',
        category: 'Reminder',
        createdAt: now,
      }),
      mockNotification({
        id: '5',
        title: '系统更新',
        content: 'v2.3.1 补丁已部署。',
        type: 'SYSTEM',
        importance: 'Minor',
        isRead: true,
        readAt: dayAgo,
        status: 'Read',
        createdAt: dayAgo,
      }),
    ],
    loading: false,
  },
};

export const Loading: Story = {
  args: {
    notifications: [],
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    notifications: [],
    loading: false,
  },
};

export const AllRead: Story = {
  args: {
    notifications: [
      mockNotification({
        id: '1',
        title: '系统维护完成',
        content: '维护窗口已结束，所有服务恢复正常。',
        isRead: true,
        readAt: hourAgo,
        status: 'Read',
        createdAt: dayAgo,
      }),
      mockNotification({
        id: '2',
        title: '欢迎使用知行 (MemoFlow)',
        content: '感谢注册，开始您的高效之旅！',
        isRead: true,
        readAt: dayAgo,
        status: 'Read',
        createdAt: dayAgo,
      }),
    ],
    loading: false,
  },
};
