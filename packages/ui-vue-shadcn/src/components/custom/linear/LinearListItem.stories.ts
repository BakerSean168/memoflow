import type { Meta, StoryObj } from '@storybook/vue3-vite';
import LinearListItem from './LinearListItem.vue';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';

const meta = {
  title: 'Business/Linear/LinearListItem',
  component: LinearListItem,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text' },
    active: { control: 'boolean' },
  },
} as Meta<typeof LinearListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  ...({} as any),
  args: {
    title: 'Implement user authentication',
    subtitle: 'Add JWT-based auth flow with refresh tokens',
  },
};

export const Active: Story = {
  ...({} as any),
  args: {
    title: 'Implement user authentication',
    subtitle: 'Add JWT-based auth flow with refresh tokens',
    active: true,
  },
};

export const WithSlots: Story = {
  ...({} as any),
  render: (args: any) => ({
    components: { LinearListItem, Badge, Button },
    setup() {
      return { args };
    },
    template: `
      <div class="border rounded-md">
        <LinearListItem v-bind="args">
          <template #prefix>
            <div class="h-4 w-4 rounded-full bg-yellow-400" />
          </template>
          <template #meta>
            <Badge variant="secondary">High</Badge>
            <span>Jan 15</span>
          </template>
          <template #actions>
            <Button variant="ghost" size="icon-xs">⋯</Button>
          </template>
        </LinearListItem>
      </div>
    `,
  }),
  args: {
    title: 'Fix navigation bug on mobile',
    subtitle: "Menu doesn't close after selecting an item",
  },
};

export const ListExample: Story = {
  ...({} as any),
  render: (args: any) => ({
    components: { LinearListItem, Badge },
    template: `
      <div class="border rounded-md">
        <LinearListItem title="Design system updates" subtitle="Update color tokens and typography">
          <template #prefix><div class="h-4 w-4 rounded-full bg-blue-400" /></template>
          <template #meta><Badge variant="outline">Low</Badge></template>
        </LinearListItem>
        <LinearListItem title="API rate limiting" subtitle="Implement rate limiting for public endpoints" active>
          <template #prefix><div class="h-4 w-4 rounded-full bg-green-400" /></template>
          <template #meta><Badge variant="secondary">Medium</Badge></template>
        </LinearListItem>
        <LinearListItem title="Database migration" subtitle="Migrate user table to new schema">
          <template #prefix><div class="h-4 w-4 rounded-full bg-red-400" /></template>
          <template #meta><Badge variant="destructive">Critical</Badge></template>
        </LinearListItem>
      </div>
    `,
  }),
};
