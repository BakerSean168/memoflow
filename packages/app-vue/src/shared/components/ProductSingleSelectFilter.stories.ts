import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import ProductSingleSelectFilter from './ProductSingleSelectFilter.vue';
import type { ResponsiveSegmentedFilterOption } from './responsive-segmented-filter.types';

const statusOptions: ResponsiveSegmentedFilterOption[] = [
  { value: 'all', label: 'All tasks', count: 128 },
  { value: 'open', label: 'Open', count: 42 },
  { value: 'active', label: 'Active', count: 12 },
  { value: 'done', label: 'Completed', count: 74 },
  { value: 'archived', label: 'Archived', count: 0, disabled: true },
];

const meta = {
  title: 'Business/AppVue/ProductSingleSelectFilter',
  component: ProductSingleSelectFilter,
  tags: ['autodocs'],
  args: {
    modelValue: 'open',
    options: statusOptions,
    accessibleLabel: 'Filter tasks by status',
    testId: 'story-status-filter',
    showCurrentCount: true,
  },
  render: (args) => ({
    components: { ProductSingleSelectFilter },
    setup() {
      const value = ref(args.modelValue);
      return { args, value };
    },
    template: `
      <div class="w-[28rem] rounded-xl border bg-background p-3">
        <ProductSingleSelectFilter
          v-bind="args"
          :model-value="value"
          @update:model-value="value = $event"
        />
      </div>
    `,
  }),
} satisfies Meta<typeof ProductSingleSelectFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const OpenMenu: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('story-status-filter'));
    await page.findByRole('menuitemradio', { name: /Active/ });
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
