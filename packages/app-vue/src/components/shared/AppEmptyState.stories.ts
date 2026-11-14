import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Inbox, ListChecks } from '@lucide/vue';
import AppEmptyState from './AppEmptyState.vue';

const meta = {
  title: 'Business/AppVue/AppEmptyState',
  component: AppEmptyState,
  tags: ['autodocs'],
  args: {
    icon: Inbox,
    title: 'No notifications yet',
    description: 'Mentions, reminders and schedule changes will appear here.',
    actionLabel: 'Check notification settings',
    secondaryLabel: 'Dismiss for now',
  },
  render: (args) => ({
    components: { AppEmptyState },
    setup() {
      return { args };
    },
    template: `
      <div class="w-[40rem] rounded-xl border bg-background">
        <AppEmptyState v-bind="args" @action="() => {}" @secondary="() => {}" />
      </div>
    `,
  }),
} satisfies Meta<typeof AppEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const Inline: Story = {
  args: {
    density: 'inline',
    icon: ListChecks,
    title: 'No tasks match these filters',
    description: 'Clear a filter or create a task to see it here.',
    actionLabel: 'Create task',
    secondaryLabel: undefined,
  },
};

export const WithoutActions: Story = {
  args: {
    actionLabel: undefined,
    secondaryLabel: undefined,
  },
};
