import type { Meta, StoryObj } from '@storybook/vue3-vite';
import InAppNotification from './InAppNotification.vue';
import type { NotificationItem } from './types';

function mockNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    title: '任务即将到期',
    message: '您的任务「完成季度报告」将在 30 分钟后到期。',
    type: 'TASK',
    priority: 'NORMAL',
    ...overrides,
  };
}

const meta = {
  title: 'Business/Notification/InAppNotification',
  component: InAppNotification,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    notifications: { description: '当前显示的通知列表' },
  },
} satisfies Meta<typeof InAppNotification>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleNotification: Story = {
  args: {
    notifications: [mockNotification()],
  },
};

export const MultipleNotifications: Story = {
  args: {
    notifications: [
      mockNotification({
        id: '1',
        title: '紧急：系统维护通知',
        message: '系统将于今晚 22:00 进行维护升级，请提前保存数据。',
        type: 'SYSTEM',
        priority: 'URGENT',
      }),
      mockNotification({
        id: '2',
        title: '目标进度更新',
        message: '您的年度 OKR「提升代码质量」已达成 75%。',
        type: 'GOAL',
        priority: 'HIGH',
      }),
      mockNotification({
        id: '3',
        title: '日程提醒',
        message: '10 分钟后有「团队周会」。',
        type: 'SCHEDULE',
        priority: 'NORMAL',
      }),
      mockNotification({
        id: '4',
        title: '提醒',
        message: '别忘了喝水 💧',
        type: 'REMINDER',
        priority: 'LOW',
      }),
    ],
  },
};

export const UrgentOnly: Story = {
  args: {
    notifications: [
      mockNotification({
        id: '1',
        title: '紧急任务',
        message: '客户反馈的 P0 Bug 需要立即处理！',
        type: 'TASK',
        priority: 'URGENT',
      }),
    ],
  },
};

export const Empty: Story = {
  args: {
    notifications: [],
  },
};
