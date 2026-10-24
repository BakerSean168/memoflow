import type { Meta, StoryObj } from '@storybook/vue3-vite';
import LinearSidebarItem from './LinearSidebarItem.vue';

const meta = {
  title: 'Business/Linear/LinearSidebarItem',
  component: LinearSidebarItem,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    active: { control: 'boolean' },
    count: { control: 'text' },
  },
} as Meta<typeof LinearSidebarItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  ...({} as any),
  args: {
    label: 'My Issues',
  },
};

export const Active: Story = {
  ...({} as any),
  args: {
    label: 'My Issues',
    active: true,
  },
};

export const WithCount: Story = {
  ...({} as any),
  args: {
    label: 'Inbox',
    count: 12,
  },
};

export const WithIcon: Story = {
  ...({} as any),
  render: (args: any) => ({
    components: { LinearSidebarItem },
    setup() {
      return { args };
    },
    template: `
      <LinearSidebarItem v-bind="args">
        <template #icon>📋</template>
      </LinearSidebarItem>
    `,
  }),
  args: {
    label: 'My Issues',
    count: 5,
    active: true,
  },
};

export const SidebarExample: Story = {
  ...({} as any),
  render: (args: any) => ({
    components: { LinearSidebarItem },
    template: `
      <div class="w-[220px] p-2 space-y-0.5 bg-sidebar border rounded-md">
        <LinearSidebarItem label="Inbox" :count="3">
          <template #icon>📥</template>
        </LinearSidebarItem>
        <LinearSidebarItem label="My Issues" active :count="12">
          <template #icon>📋</template>
        </LinearSidebarItem>
        <LinearSidebarItem label="Views">
          <template #icon>👁️</template>
        </LinearSidebarItem>
        <LinearSidebarItem label="Cycles">
          <template #icon>🔄</template>
        </LinearSidebarItem>
        <LinearSidebarItem label="Settings">
          <template #icon>⚙️</template>
        </LinearSidebarItem>
      </div>
    `,
  }),
};
