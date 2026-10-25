import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { AspectRatio } from '.';

const meta = {
  title: 'Atoms/AspectRatio',
  component: AspectRatio,
  tags: ['autodocs'],
  argTypes: {
    ratio: {
      control: 'number',
    },
  },
  args: {
    ratio: 16 / 9,
  },
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { AspectRatio },
    setup() {
      return { args };
    },
    template: `
      <div class="w-[450px]">
        <AspectRatio v-bind="args">
          <img src="https://placehold.co/450x253?text=16:9" alt="Placeholder" class="h-full w-full rounded-md object-cover" />
        </AspectRatio>
      </div>
    `,
  }),
};

export const Square: Story = {
  render: () => ({
    components: { AspectRatio },
    template: `
      <div class="w-[300px]">
        <AspectRatio :ratio="1">
          <img src="https://placehold.co/300x300?text=1:1" alt="Square" class="h-full w-full rounded-md object-cover" />
        </AspectRatio>
      </div>
    `,
  }),
};

export const AllRatios: Story = {
  render: () => ({
    components: { AspectRatio },
    template: `
      <div class="flex gap-4">
        <div class="w-[200px]">
          <p class="mb-2 text-sm font-medium">16:9</p>
          <AspectRatio :ratio="16/9">
            <div class="flex h-full w-full items-center justify-center rounded-md bg-muted">16:9</div>
          </AspectRatio>
        </div>
        <div class="w-[200px]">
          <p class="mb-2 text-sm font-medium">4:3</p>
          <AspectRatio :ratio="4/3">
            <div class="flex h-full w-full items-center justify-center rounded-md bg-muted">4:3</div>
          </AspectRatio>
        </div>
        <div class="w-[200px]">
          <p class="mb-2 text-sm font-medium">1:1</p>
          <AspectRatio :ratio="1">
            <div class="flex h-full w-full items-center justify-center rounded-md bg-muted">1:1</div>
          </AspectRatio>
        </div>
      </div>
    `,
  }),
};
