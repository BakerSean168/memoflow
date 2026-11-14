import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import ProductTimeZoneSelector from './ProductTimeZoneSelector.vue';

const meta = {
  title: 'Business/AppVue/ProductTimeZoneSelector',
  component: ProductTimeZoneSelector,
  tags: ['autodocs'],
  args: {
    modelValue: 'America/New_York',
    testId: 'story-time-zone',
  },
  render: (args) => ({
    components: { ProductTimeZoneSelector },
    setup() {
      const value = ref(args.modelValue);
      return { args, value };
    },
    template: `
      <div class="w-[28rem] rounded-xl border bg-background p-4">
        <ProductTimeZoneSelector
          v-bind="args"
          :model-value="value"
          @update:model-value="value = $event"
        />
      </div>
    `,
  }),
} satisfies Meta<typeof ProductTimeZoneSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const OpenList: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('story-time-zone'));
    await page.findByTestId('story-time-zone-search');
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
