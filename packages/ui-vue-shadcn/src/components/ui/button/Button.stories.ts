import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button } from '.';

const meta = {
  title: 'Atoms/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'xs', 'lg', 'icon', 'icon-sm', 'icon-xs'],
    },
    /* @ts-ignore */ disabled: { control: 'boolean' },
  },
  args: { ...({} as any), variant: 'default', size: 'default' },
} as Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  ...({} as any),
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Button</Button>',
  }),
};

export const AllVariants: Story = {
  ...({} as any),
  render: () => ({
    components: { Button },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <Button variant="default">Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
    `,
  }),
};

export const AllSizes: Story = {
  ...({} as any),
  render: () => ({
    components: { Button },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <Button size="lg">Large</Button>
        <Button size="default">Default</Button>
        <Button size="sm">Small</Button>
        <Button size="xs">Extra Small</Button>
        <Button size="icon">🔔</Button>
        <Button size="icon-sm">🔔</Button>
        <Button size="icon-xs">🔔</Button>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  ...({} as any),
  render: () => ({
    components: { Button },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <Button disabled>Default</Button>
        <Button variant="secondary" disabled>Secondary</Button>
        <Button variant="destructive" disabled>Destructive</Button>
        <Button variant="outline" disabled>Outline</Button>
      </div>
    `,
  }),
};
