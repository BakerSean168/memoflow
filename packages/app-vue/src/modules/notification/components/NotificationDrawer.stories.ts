import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NotificationDrawer from './NotificationDrawer.vue';

const meta = {
  title: 'Business/Notification/NotificationDrawer',
  component: NotificationDrawer,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    modelValue: { description: '是否打开', control: 'boolean' },
    unreadCount: { description: '未读通知数', control: 'number' },
  },
} satisfies Meta<typeof NotificationDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    modelValue: true,
    unreadCount: 3,
  },
  render: (args) => ({
    components: { NotificationDrawer },
    setup() {
      return { args };
    },
    template: `
      <NotificationDrawer v-bind="args">
        <div class="space-y-3 px-2">
          <div class="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white text-lg">✅</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold">任务已完成</p>
              <p class="text-sm text-muted-foreground">「部署生产环境」任务已标记为完成。</p>
              <p class="text-xs text-muted-foreground mt-1">5 分钟前</p>
            </div>
          </div>
          <div class="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white text-lg">🎯</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold">目标进度更新</p>
              <p class="text-sm text-muted-foreground">OKR「提升代码质量」已达 85%。</p>
              <p class="text-xs text-muted-foreground mt-1">1 小时前</p>
            </div>
          </div>
          <div class="flex gap-3 p-3 rounded-lg">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white text-lg">⚙️</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm">系统更新完成</p>
              <p class="text-sm text-muted-foreground">MemoFlow v2.3.0 已部署成功。</p>
              <p class="text-xs text-muted-foreground mt-1">昨天</p>
            </div>
          </div>
        </div>
      </NotificationDrawer>
    `,
  }),
};

export const EmptyDrawer: Story = {
  args: {
    modelValue: true,
    unreadCount: 0,
  },
  render: (args) => ({
    components: { NotificationDrawer },
    setup() {
      return { args };
    },
    template: `
      <NotificationDrawer v-bind="args">
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <p class="text-4xl mb-3">🔔</p>
          <p class="text-sm text-muted-foreground">暂无通知</p>
        </div>
      </NotificationDrawer>
    `,
  }),
};

export const Closed: Story = {
  args: {
    modelValue: false,
    unreadCount: 5,
  },
};
