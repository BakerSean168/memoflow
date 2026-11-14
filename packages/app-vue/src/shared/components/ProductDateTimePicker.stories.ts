import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { Instant } from '@memoflow/shared-primitives';
import ProductDateTimePicker from './ProductDateTimePicker.vue';

const scheduled: Instant = Date.UTC(2026, 10, 20, 9, 30);

const meta = {
  title: 'Business/AppVue/ProductDateTimePicker',
  component: ProductDateTimePicker,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    modelValue: scheduled,
    open: true,
    title: 'Schedule task',
    description: 'Choose when this task should appear on the calendar.',
    testId: 'story-date-time-picker',
  },
  render: (args) => ({
    components: { ProductDateTimePicker },
    setup() {
      const open = ref(args.open);
      const value = ref(args.modelValue);
      return { args, open, value };
    },
    template: `
      <ProductDateTimePicker
        v-bind="args"
        :open="open"
        :model-value="value"
        @update:open="open = $event"
        @update:model-value="value = $event"
      />
    `,
  }),
} satisfies Meta<typeof ProductDateTimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dialog: Story = {};

export const FutureMinimumValidation: Story = {
  args: {
    modelValue: null,
    minValue: Date.now() + 30 * 24 * 60 * 60 * 1000,
    title: 'Reschedule task',
    description: 'The new time must stay after the current reminder window.',
  },
};

export const PanelPresentation: Story = {
  args: { presentation: 'panel' },
  render: (args) => ({
    components: { ProductDateTimePicker },
    setup() {
      const open = ref(args.open);
      const value = ref(args.modelValue);
      return { args, open, value };
    },
    template: `
      <main class="relative h-[680px] overflow-hidden rounded-xl border bg-background" style="container-type: inline-size">
        <div class="p-6">
          <h1 class="text-base font-semibold">Tasks</h1>
          <p class="text-sm text-muted-foreground">The picker stays inside the owning business pane.</p>
        </div>
        <ProductDateTimePicker
          v-bind="args"
          :open="open"
          :model-value="value"
          @update:open="open = $event"
          @update:model-value="value = $event"
        />
      </main>
    `,
  }),
};
