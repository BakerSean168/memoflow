import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import QuickTaskDialog from './QuickTaskDialog.vue';

const meta = {
  title: 'Business/Task/QuickTaskDialog',
  component: QuickTaskDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    modelValue: { description: '是否打开', control: 'boolean' },
    saving: { description: '保存中', control: 'boolean' },
    submitError: { description: '提交错误', control: 'text' },
    presentation: { description: '对话框或侧栏面板', control: 'select' },
  },
  render: (args) => ({
    components: { QuickTaskDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: '<div style="height: 720px"><QuickTaskDialog v-bind="args" v-model="open" /></div>',
  }),
} satisfies Meta<typeof QuickTaskDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { modelValue: true, saving: false, submitError: '', presentation: 'dialog' },
};

export const Saving: Story = {
  args: { modelValue: true, saving: true, submitError: '', presentation: 'dialog' },
};

export const SubmitError: Story = {
  args: {
    modelValue: true,
    saving: false,
    submitError: '网络不可用，请稍后重试。',
    presentation: 'dialog',
  },
};

export const PanelPresentation: Story = {
  args: { modelValue: true, saving: false, submitError: '', presentation: 'panel' },
};
