import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NotificationPermissionWarning from './NotificationPermissionWarning.vue';

const meta = {
  title: 'Business/Notification/NotificationPermissionWarning',
  component: NotificationPermissionWarning,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    showWarning: { description: '是否显示警告', control: 'boolean' },
    statusMessage: { description: '状态提示文本', control: 'text' },
    canRequestPermission: { description: '是否可以请求权限', control: 'boolean' },
  },
} satisfies Meta<typeof NotificationPermissionWarning>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CanRequest: Story = {
  args: {
    showWarning: true,
    statusMessage: '浏览器通知权限尚未开启，您可能会错过重要提醒。',
    canRequestPermission: true,
  },
};

export const CannotRequest: Story = {
  args: {
    showWarning: true,
    statusMessage: '浏览器通知权限已被永久拒绝，请在浏览器设置中手动开启。',
    canRequestPermission: false,
  },
};

export const Hidden: Story = {
  args: {
    showWarning: false,
    statusMessage: '',
    canRequestPermission: false,
  },
};
