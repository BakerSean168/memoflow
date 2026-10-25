import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ChartTooltip } from '.';

const meta = {
  title: 'Atoms/Chart',
  component: ChartTooltip,
  tags: ['autodocs'],
} as Meta<typeof ChartTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  ...({} as any),
  render: () => ({
    template: `
      <div class="rounded-md border p-6">
        <p class="text-sm font-medium">Chart Components</p>
        <p class="mt-2 text-sm text-muted-foreground">
          ChartTooltip, ChartCrosshair, ChartLegend, and ChartSingleTooltip are
          utility components designed to work within a chart context (e.g., unovis).
          They require a parent chart provider to render correctly.
        </p>
      </div>
    `,
  }),
};
