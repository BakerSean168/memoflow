import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Progress } from '.';

const meta = {
  title: 'Atoms/Progress',
  component: Progress,
  tags: ['autodocs'],
  argTypes: {
    modelValue: { control: { type: 'range', min: 0, max: 100, step: 1 } },
  },
  args: { modelValue: 33 },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Progress },
    setup() {
      return { args };
    },
    template: '<Progress v-bind="args" class="w-[60%]" />',
  }),
};

export const AllStates: Story = {
  render: () => ({
    components: { Progress },
    template: `
      <div class="flex flex-col gap-4 w-[60%]">
        <div>
          <p class="text-sm text-muted-foreground mb-1">0%</p>
          <Progress :model-value="0" />
        </div>
        <div>
          <p class="text-sm text-muted-foreground mb-1">25%</p>
          <Progress :model-value="25" />
        </div>
        <div>
          <p class="text-sm text-muted-foreground mb-1">50%</p>
          <Progress :model-value="50" />
        </div>
        <div>
          <p class="text-sm text-muted-foreground mb-1">75%</p>
          <Progress :model-value="75" />
        </div>
        <div>
          <p class="text-sm text-muted-foreground mb-1">100%</p>
          <Progress :model-value="100" />
        </div>
      </div>
    `,
  }),
};
