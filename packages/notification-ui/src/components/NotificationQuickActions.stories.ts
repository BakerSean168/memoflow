import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type {
  NotificationActionIntent,
  NotificationClientDTO,
} from '@memoflow/notification-contracts';
import NotificationQuickActions from './NotificationQuickActions.vue';

const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

const completeAction = {
  kind: 'owner-command',
  actionKey: 'complete',
  commandKey: 'routine.complete',
  labelKey: 'notification.action.complete',
  owner: { type: 'routine', id: 'routine-1' },
} satisfies NotificationActionIntent;

const snoozeAction = {
  kind: 'owner-command',
  actionKey: 'snooze',
  commandKey: 'routine.snooze',
  labelKey: 'notification.action.snooze10m',
  owner: { type: 'routine', id: 'routine-1' },
} satisfies NotificationActionIntent;

function mockNotification(actions: NotificationActionIntent[] | null): NotificationClientDTO {
  return {
    id: 'notification-1',
    identityId: 'identity-1',
    title: '起身活动提醒',
    content: '已经连续久坐 50 分钟，起来走走吧。',
    type: 'REMINDER',
    category: 'Reminder',
    importance: 'Moderate',
    isRead: false,
    readAt: null,
    status: 'Delivered',
    actions,
    metadata: null,
    version: 1,
    createdAt: hourAgo,
    updatedAt: hourAgo,
    deletedAt: null,
    notificationChannels: null,
  } as unknown as NotificationClientDTO;
}

const meta = {
  title: 'Business/Notification/NotificationQuickActions',
  component: NotificationQuickActions,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({
      template:
        '<div style="position: relative; height: 96px; width: 360px; border: 1px solid hsl(var(--border)); border-radius: 0.75rem;"><story /></div>',
    }),
  ],
  argTypes: {
    notification: { description: '通知 DTO；仅前两个 owner-command 动作渲染' },
    testIdPrefix: { description: '动作按钮 testId 前缀' },
    actionsTestId: { description: '动作容器 testId' },
  },
} satisfies Meta<typeof NotificationQuickActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteAndSnooze: Story = {
  args: {
    notification: mockNotification([completeAction, snoozeAction]),
    testIdPrefix: 'notification-action',
    actionsTestId: 'notification-quick-actions',
  },
};

export const CompleteOnly: Story = {
  args: {
    notification: mockNotification([completeAction]),
    testIdPrefix: 'notification-action',
    actionsTestId: 'notification-quick-actions',
  },
};

export const NoOwnerCommands: Story = {
  args: {
    notification: mockNotification(null),
    testIdPrefix: 'notification-action',
    actionsTestId: 'notification-quick-actions',
  },
};
