import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NotificationBell from './NotificationBell.vue';

const meta = {
  title: 'Business/Notification/NotificationBell',
  component: NotificationBell,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    unreadCount: { description: '未读通知数量', control: { type: 'number', min: 0, max: 200 } },
    loading: { description: '加载状态', control: 'boolean' },
  },
} satisfies Meta<typeof NotificationBell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    unreadCount: 0,
    loading: false,
  },
};

export const WithUnread: Story = {
  args: {
    unreadCount: 5,
    loading: false,
  },
};

export const ManyUnread: Story = {
  args: {
    unreadCount: 128,
    loading: false,
  },
};

export const Loading: Story = {
  args: {
    unreadCount: 0,
    loading: true,
  },
};
