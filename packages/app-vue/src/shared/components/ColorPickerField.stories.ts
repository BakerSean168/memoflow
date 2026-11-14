import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import ColorPickerField from './ColorPickerField.vue';

const meta = {
  title: 'Business/AppVue/ColorPickerField',
  component: ColorPickerField,
  tags: ['autodocs'],
  args: {
    modelValue: '#3b82f6',
    allowClear: true,
    clearLabel: 'Clear color',
  },
  render: (args) => ({
    components: { ColorPickerField },
    setup() {
      const value = ref(args.modelValue);
      return { args, value };
    },
    template: `
      <div class="w-[20rem] rounded-xl border bg-background p-4">
        <ColorPickerField v-bind="args" :model-value="value" @update:model-value="value = $event" />
      </div>
    `,
  }),
} satisfies Meta<typeof ColorPickerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const EmptySelection: Story = {
  args: { modelValue: null, emptyLabel: 'No color' },
};

export const OpenPalette: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Blue' }));
    await page.findByRole('button', { name: 'Violet' });
  },
};
