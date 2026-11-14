import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onUnmounted } from 'vue';
import { _getConfirmState } from '@memoflow/ui-vue-shadcn';
import GlobalConfirmDialog from './GlobalConfirmDialog.vue';

type ConfirmStoryOptions = {
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  variant: 'default' | 'destructive';
};

const meta = {
  title: 'Business/AppVue/GlobalConfirmDialog',
  component: GlobalConfirmDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => {
    const options = parameters.confirm as ConfirmStoryOptions;
    return {
      components: { GlobalConfirmDialog },
      setup() {
        const state = _getConfirmState();
        Object.assign(state, options, { open: true, resolve: null });
        onUnmounted(() => {
          state.open = false;
        });
      },
      template: `<GlobalConfirmDialog />`,
    };
  },
} satisfies Meta<typeof GlobalConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Destructive: Story = {
  parameters: {
    confirm: {
      title: 'Delete this task?',
      description: 'The task and its completion history will be removed permanently.',
      confirmText: 'Delete task',
      cancelText: 'Keep task',
      variant: 'destructive',
    } satisfies ConfirmStoryOptions,
  },
};

export const Standard: Story = {
  parameters: {
    confirm: {
      title: 'Archive this routine?',
      description: 'Archived routines stop creating new task occurrences.',
      confirmText: 'Archive',
      cancelText: 'Cancel',
      variant: 'default',
    } satisfies ConfirmStoryOptions,
  },
};
