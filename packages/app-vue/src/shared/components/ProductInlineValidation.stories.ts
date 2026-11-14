import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ProductInlineValidation from './ProductInlineValidation.vue';

const meta = {
  title: 'Business/AppVue/ProductInlineValidation',
  component: ProductInlineValidation,
  tags: ['autodocs'],
  args: {
    visible: true,
    message: 'Enter a supported date format.',
    testId: 'story-inline-validation',
  },
  render: (args) => ({
    components: { ProductInlineValidation },
    setup() {
      return { args };
    },
    template: `
      <div class="w-[24rem] rounded-xl border bg-background p-4">
        <label class="text-xs font-medium text-muted-foreground" for="story-validation-input">Start date</label>
        <input
          id="story-validation-input"
          class="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          :aria-invalid="args.visible"
          aria-describedby="story-inline-validation"
          value="not a date"
        />
        <ProductInlineValidation v-bind="args" id="story-inline-validation" />
      </div>
    `,
  }),
} satisfies Meta<typeof ProductInlineValidation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VisibleError: Story = {};

export const ReservedHiddenLine: Story = {
  args: { visible: false },
};

export const LongMessage: Story = {
  args: {
    message:
      'The end date must be after the start date, including the time zone offset for this workspace.',
  },
};
