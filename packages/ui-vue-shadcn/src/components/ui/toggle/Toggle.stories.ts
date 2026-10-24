import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Toggle } from '.';

const meta = {
  title: 'Atoms/Toggle',
  component: Toggle,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['default', 'outline'] },
    size: { control: 'select', options: ['default', 'sm', 'lg'] },
    disabled: { control: 'boolean' },
  },
  args: { variant: 'default', size: 'default' },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Toggle },
    setup() {
      return { args };
    },
    template: '<Toggle v-bind="args">B</Toggle>',
  }),
};

export const AllVariants: Story = {
  render: () => ({
    components: { Toggle },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <Toggle variant="default">Default</Toggle>
        <Toggle variant="outline">Outline</Toggle>
        <Toggle variant="default" disabled>Disabled</Toggle>
      </div>
    `,
  }),
};

export const AllSizes: Story = {
  render: () => ({
    components: { Toggle },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <Toggle size="sm">Sm</Toggle>
        <Toggle size="default">Default</Toggle>
        <Toggle size="lg">Lg</Toggle>
      </div>
    `,
  }),
};
