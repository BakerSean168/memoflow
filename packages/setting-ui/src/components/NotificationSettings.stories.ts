import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NotificationSettings from './NotificationSettings.vue';

const meta = {
  title: 'Business/Setting/NotificationSettings',
  component: NotificationSettings,
  tags: ['autodocs'],
  argTypes: {},
  args: {},
} satisfies Meta<typeof NotificationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Placeholder: Story = {
  render: () => ({
    components: { NotificationSettings },
    template: '<div class="max-w-lg"><NotificationSettings /></div>',
  }),
};
