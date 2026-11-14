import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { GoalStatus } from '@memoflow/goal-contracts';
import GoalStatusPicker from './GoalStatusPicker.vue';

const meta = {
  title: 'Business/Goal/GoalStatusPicker',
  component: GoalStatusPicker,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    modelValue: { description: '当前状态', control: 'select' },
    baseStatus: { description: '聚合基线状态，决定可选迁移' },
    disabled: { description: '是否禁用', control: 'boolean' },
  },
  render: (args) => ({
    components: { GoalStatusPicker },
    setup() {
      const status = ref<GoalStatus>(args.modelValue);
      return { args, status };
    },
    template:
      '<div class="flex items-center gap-3 p-4"><GoalStatusPicker v-bind="args" v-model="status" /><span class="text-xs text-muted-foreground">当前：{{ status }}</span></div>',
  }),
} satisfies Meta<typeof GoalStatusPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Planned: Story = {
  args: { modelValue: 'Planned', baseStatus: 'Planned', disabled: false },
};

export const InProgress: Story = {
  args: { modelValue: 'InProgress', baseStatus: 'InProgress', disabled: false },
};

export const Completed: Story = {
  args: { modelValue: 'Completed', baseStatus: 'Completed', disabled: false },
};

export const Disabled: Story = {
  args: { modelValue: 'InProgress', baseStatus: 'InProgress', disabled: true },
};
