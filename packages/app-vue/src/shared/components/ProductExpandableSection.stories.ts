import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { ChevronDown } from '@lucide/vue';
import ProductExpandableSection from './ProductExpandableSection.vue';

const meta = {
  title: 'Business/AppVue/ProductExpandableSection',
  component: ProductExpandableSection,
  tags: ['autodocs'],
  args: { open: true },
  render: (args) => ({
    components: { ProductExpandableSection, ChevronDown },
    setup() {
      const open = ref(args.open);
      return { args, open };
    },
    template: `
      <div class="w-[32rem]">
        <ProductExpandableSection :open="open" @update:open="open = $event">
          <template #trigger>
            <button type="button" class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium">
              <ChevronDown class="size-4 transition-transform" :class="open ? '' : '-rotate-90'" />
              Advanced scheduling
            </button>
          </template>
          <div class="space-y-2 px-3 py-3 text-sm">
            <p>Repeat every weekday until the end of the quarter.</p>
            <p class="text-muted-foreground">Holidays are skipped automatically.</p>
          </div>
        </ProductExpandableSection>
      </div>
    `,
  }),
} satisfies Meta<typeof ProductExpandableSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
  args: { open: false },
};
