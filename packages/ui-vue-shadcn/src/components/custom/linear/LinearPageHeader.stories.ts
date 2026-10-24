import type { Meta, StoryObj } from '@storybook/vue3-vite';
import LinearPageHeader from './LinearPageHeader.vue';
import { Button } from '../../ui/button';

const meta = {
  title: 'Business/Linear/LinearPageHeader',
  component: LinearPageHeader,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
} satisfies Meta<typeof LinearPageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'My Issues',
    description: 'All active issues assigned to you.',
  },
};

export const TitleOnly: Story = {
  args: {
    title: 'Projects',
  },
};

export const WithActions: Story = {
  render: (args) => ({
    components: { LinearPageHeader, Button },
    setup() {
      return { args };
    },
    template: `
      <LinearPageHeader v-bind="args">
        <template #actions>
          <Button size="sm" variant="outline">Filter</Button>
          <Button size="sm">New Issue</Button>
        </template>
      </LinearPageHeader>
    `,
  }),
  args: {
    title: 'Issues',
    description: 'Track and manage all issues.',
  },
};
