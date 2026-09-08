import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TaskPlanForm from './TaskPlanForm.vue';

const meta = {
  title: 'Business/Task/TaskPlanForm/TaskPlanForm',
  component: TaskPlanForm,
  tags: ['autodocs'],
} satisfies Meta<typeof TaskPlanForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    template: '<div class="text-sm text-muted-foreground">TaskPlanForm story scaffold.</div>',
  }),
};
