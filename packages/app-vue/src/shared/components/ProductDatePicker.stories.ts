import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import { requireYmd } from '@memoflow/shared-primitives';
import ProductDatePicker from './ProductDatePicker.vue';

const meta = {
  title: 'Business/AppVue/ProductDatePicker',
  component: ProductDatePicker,
  tags: ['autodocs'],
  args: {
    modelValue: requireYmd('2026-11-20'),
    label: 'Due date',
    testId: 'story-due-date',
    ariaLabel: 'Choose due date',
  },
  render: (args) => ({
    components: { ProductDatePicker },
    setup() {
      const value = ref(args.modelValue);
      return { args, value };
    },
    template: `
      <div class="w-[24rem] rounded-xl border bg-background p-4">
        <ProductDatePicker v-bind="args" :model-value="value" @update:model-value="value = $event" />
      </div>
    `,
  }),
} satisfies Meta<typeof ProductDatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Chip: Story = {};

export const Empty: Story = {
  args: { modelValue: null, placeholder: 'Set due date' },
};

export const Field: Story = {
  args: { variant: 'field', pickerWidth: 'pane' },
};

export const OpenPicker: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('story-due-date'));
    await page.findByTestId('story-due-date-query');
  },
};
