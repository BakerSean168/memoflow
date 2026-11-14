import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import LabelPicker from './LabelPicker.vue';
import type { LabelPickerOption } from './label-selection.types';

const labelOptions: LabelPickerOption[] = [
  { id: 'lbl-deep-work', name: 'Deep work', color: '#3b82f6' },
  { id: 'lbl-quick-win', name: 'Quick win', color: '#22c55e' },
  { id: 'lbl-needs-review', name: 'Needs review', color: '#f59e0b' },
  { id: 'lbl-blocked', name: 'Blocked', color: '#ef4444' },
  { id: 'lbl-personal', name: 'Personal', color: null },
];

const meta = {
  title: 'Business/AppVue/LabelPicker',
  component: LabelPicker,
  tags: ['autodocs'],
  args: {
    modelValue: ['lbl-deep-work', 'lbl-needs-review', 'lbl-personal'],
    options: labelOptions,
    placeholder: 'Select labels',
  },
  render: (args) => ({
    components: { LabelPicker },
    setup() {
      const value = ref([...args.modelValue]);
      return { args, value };
    },
    template: `
      <div class="w-[24rem] rounded-xl border bg-background p-4">
        <LabelPicker v-bind="args" :model-value="value" @update:model-value="value = $event" />
      </div>
    `,
  }),
} satisfies Meta<typeof LabelPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const Empty: Story = {
  args: { modelValue: [] },
};

export const Compact: Story = {
  args: { compact: true, modelValue: ['lbl-quick-win'] },
};

export const OpenMenu: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('label-picker-trigger'));
    await page.findByText('Blocked');
  },
};
