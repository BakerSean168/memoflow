import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { CalendarDays, Flag, Tag } from '@lucide/vue';
import ProductPropertyChip from './ProductPropertyChip.vue';

const meta = {
  title: 'Business/AppVue/ProductPropertyChip',
  component: ProductPropertyChip,
  tags: ['autodocs'],
  args: { active: undefined, disabled: false },
  render: (args, { parameters }) => ({
    components: { ProductPropertyChip, CalendarDays, Flag, Tag },
    setup() {
      return { args, parameters };
    },
    template: `
      <ProductPropertyChip v-bind="args">
        <template v-if="parameters.icon === 'date'" #icon><CalendarDays class="h-3.5 w-3.5" /></template>
        <template v-else-if="parameters.icon === 'flag'" #icon><Flag class="h-3.5 w-3.5" /></template>
        <template v-else-if="parameters.icon === 'tag'" #icon><Tag class="h-3.5 w-3.5" /></template>
        {{ parameters.label }}
      </ProductPropertyChip>
    `,
  }),
} satisfies Meta<typeof ProductPropertyChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { label: 'Due Nov 20', icon: 'date' },
};

export const Active: Story = {
  args: { active: true },
  parameters: { label: 'High priority', icon: 'flag' },
};

export const Disabled: Story = {
  args: { disabled: true },
  parameters: { label: 'Waiting on review', icon: 'flag' },
};

export const LongContent: Story = {
  parameters: {
    label: 'Every weekday until the end of the quarter, excluding holidays',
    icon: 'tag',
  },
};
