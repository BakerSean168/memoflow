import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { RoutineProfileDto } from '@memoflow/routine-contracts';
import RoutineProfileDialog from './RoutineProfileDialog.vue';

const profile = {
  id: 'profile-work',
  name: '工作时段',
  description: '工作日 09:00 – 18:00，仅启用工作相关例程。',
  enabled: true,
  active: true,
  version: 2,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-11-10T08:00:00.000Z',
} as unknown as RoutineProfileDto;

const meta = {
  title: 'Business/Routine/RoutineProfileDialog',
  component: RoutineProfileDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    open: { description: '是否打开', control: 'boolean' },
    profile: { description: '编辑的档案；为空时创建' },
    saving: { description: '保存中', control: 'boolean' },
    submitError: { description: '提交错误' },
  },
  render: (args) => ({
    components: { RoutineProfileDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template:
      '<div style="height: 640px"><RoutineProfileDialog v-bind="args" v-model:open="open" /></div>',
  }),
} satisfies Meta<typeof RoutineProfileDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  args: { open: true, profile: null, saving: false, submitError: null },
};

export const Edit: Story = {
  args: { open: true, profile, saving: false, submitError: null },
};

export const SaveFailure: Story = {
  args: { open: true, profile, saving: false, submitError: '名称已存在，请换一个。' },
};

export const Saving: Story = {
  args: { open: true, profile, saving: true, submitError: null },
};
