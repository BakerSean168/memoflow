import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import GroupDialog from './GroupDialog.vue';

const meta = {
  title: 'Business/Reminder/GroupDialog',
  component: GroupDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GroupDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateMode: Story = {
  render: () => ({
    components: { GroupDialog },
    setup() {
      const dialogRef = ref();
      const open = () => dialogRef.value?.open();
      return { dialogRef, open };
    },
    template: `
      <div class="p-8">
        <button class="px-4 py-2 bg-primary text-primary-foreground rounded-md" @click="open">新建分组</button>
        <GroupDialog ref="dialogRef" />
      </div>
    `,
  }),
};

export const EditMode: Story = {
  render: () => ({
    components: { GroupDialog },
    setup() {
      const dialogRef = ref();
      const editGroup = {
        id: 'grp-1',
        name: '工作提醒',
        description: '所有工作相关提醒',
        icon: 'mdi-briefcase',
        color: '#2196F3',
        order: 1,
      };
      const open = () => dialogRef.value?.openForEdit(editGroup);
      return { dialogRef, open, editGroup };
    },
    template: `
      <div class="p-8">
        <button class="px-4 py-2 bg-primary text-primary-foreground rounded-md" @click="open">编辑分组</button>
        <GroupDialog ref="dialogRef" :group="editGroup" />
      </div>
    `,
  }),
};
