import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Avatar, AvatarImage, AvatarFallback } from '.';

const meta = {
  title: 'Atoms/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'base', 'lg'] },
    shape: { control: 'select', options: ['circle', 'square'] },
  },
  args: { size: 'sm', shape: 'circle' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Avatar, AvatarImage, AvatarFallback },
    setup() {
      return { args };
    },
    template: `
      <Avatar v-bind="args">
        <AvatarImage src="https://github.com/unovue.png" alt="UnoVue" />
        <AvatarFallback>UV</AvatarFallback>
      </Avatar>
    `,
  }),
};

export const WithFallback: Story = {
  render: () => ({
    components: { Avatar, AvatarImage, AvatarFallback },
    template: `
      <Avatar>
        <AvatarImage src="https://invalid-url.example.com/broken.png" alt="User" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
    `,
  }),
};

export const AllSizes: Story = {
  render: () => ({
    components: { Avatar, AvatarImage, AvatarFallback },
    template: `
      <div class="flex items-center gap-4">
        <Avatar size="sm">
          <AvatarFallback>SM</AvatarFallback>
        </Avatar>
        <Avatar size="base">
          <AvatarFallback>MD</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>LG</AvatarFallback>
        </Avatar>
      </div>
    `,
  }),
};

export const AllShapes: Story = {
  render: () => ({
    components: { Avatar, AvatarImage, AvatarFallback },
    template: `
      <div class="flex items-center gap-4">
        <Avatar shape="circle" size="base">
          <AvatarFallback>CI</AvatarFallback>
        </Avatar>
        <Avatar shape="square" size="base">
          <AvatarFallback>SQ</AvatarFallback>
        </Avatar>
      </div>
    `,
  }),
};
