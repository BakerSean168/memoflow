import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NotificationItem from './NotificationItem.vue';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';

const now = new Date().toISOString();
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const dayAgo = new Date(Date.now() - 86400_000).toISOString();

function mockNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID?.() ?? '1',
    identityId: 'user-1',
    title: '任务提醒',
    content: '您的任务「编写单元测试」将在 1 小时后到期。',
    type: 'TASK',
    category: 'Task',
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
  title: 'Business/Notification/NotificationItem',
  component: NotificationItem,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 500px;"><story /></div>' })],
  argTypes: {
    notification: { description: '通知数据对象 (NotificationClientDTO)' },
  },
} satisfies Meta<typeof NotificationItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {
  args: {
    notification: mockNotification(),
  },
};

export const Read: Story = {
  args: {
    notification: mockNotification({
      title: '系统升级完成',
      content: 'MemoFlow v2.3.0 已成功部署，包含多项性能优化。',
      type: 'SYSTEM',
      category: 'System',
      importance: 'Minor',
      isRead: true,
      readAt: now,
      status: 'Read',
      createdAt: dayAgo,
      updatedAt: now,
    }),
  },
};

export const Urgent: Story = {
  args: {
    notification: mockNotification({
      title: '紧急：生产环境告警',
      content: 'API 响应时间超过阈值 (> 5s)，请立即检查。',
      type: 'SYSTEM',
      category: 'System',
      importance: 'Vital',
      status: 'Delivered',
      createdAt: now,
      updatedAt: now,
    }),
  },
};

export const Important: Story = {
  args: {
    notification: mockNotification({
      title: '目标进度里程碑',
      content: '恭喜！年度目标「技术能力提升」已达成 90%。',
      type: 'GOAL',
      category: 'Goal',
      importance: 'Important',
      createdAt: hourAgo,
      updatedAt: hourAgo,
    }),
  },
};

export const Reminder: Story = {
  args: {
    notification: mockNotification({
      title: '日程提醒',
      content: '15 分钟后有「产品评审会」，请提前准备材料。',
      type: 'REMINDER',
      category: 'Reminder',
      importance: 'Moderate',
      createdAt: now,
      updatedAt: now,
    }),
  },
};

export const Schedule: Story = {
  args: {
    notification: mockNotification({
      title: '日程冲突',
      content: '「团队站会」与「客户 Demo」时间冲突，请调整。',
      type: 'SCHEDULE',
      category: 'Schedule',
      importance: 'Important',
      createdAt: hourAgo,
      updatedAt: hourAgo,
    }),
  },
};
