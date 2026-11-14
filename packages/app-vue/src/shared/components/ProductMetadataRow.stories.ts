import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ProductMetadataRow from './ProductMetadataRow.vue';

const meta = {
  title: 'Business/AppVue/ProductMetadataRow',
  component: ProductMetadataRow,
  tags: ['autodocs'],
  args: { label: 'Status' },
  render: (args, { parameters }) => ({
    components: { ProductMetadataRow },
    setup() {
      return { args, parameters };
    },
    template: `
      <div class="w-[32rem] rounded-xl border bg-background px-4 py-2" style="container-type: inline-size">
        <ProductMetadataRow v-bind="args">
          <span class="text-sm">{{ parameters.value }}</span>
        </ProductMetadataRow>
        <ProductMetadataRow label="Priority">
          <span class="inline-flex w-fit items-center rounded-full bg-[hsl(var(--surface-raised))] px-2 py-0.5 text-xs">High</span>
        </ProductMetadataRow>
        <ProductMetadataRow label="Assignee">
          <span class="text-sm">Alex Chen</span>
        </ProductMetadataRow>
      </div>
    `,
  }),
} satisfies Meta<typeof ProductMetadataRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { value: 'In progress' },
};

export const LongValue: Story = {
  args: { label: 'Description' },
  parameters: {
    value:
      'Align product, design and engineering on the next quarter roadmap before the planning review.',
  },
};

export const SlotLabel: Story = {
  render: (args) => ({
    components: { ProductMetadataRow },
    setup() {
      return { args };
    },
    template: `
      <div class="w-[32rem] rounded-xl border bg-background px-4 py-2" style="container-type: inline-size">
        <ProductMetadataRow v-bind="args">
          <template #label>
            <span class="inline-flex items-center gap-1">Due date</span>
          </template>
          <span class="text-sm">Nov 20, 2026 · 17:00</span>
        </ProductMetadataRow>
      </div>
    `,
  }),
};
