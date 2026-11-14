import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button, Popover, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import ProductPopoverSurface from './ProductPopoverSurface.vue';

const meta = {
  title: 'Business/AppVue/ProductPopoverSurface',
  component: ProductPopoverSurface,
  tags: ['autodocs'],
  args: { recipe: 'property' },
  render: (args) => ({
    components: { Popover, PopoverTrigger, ProductPopoverSurface, Button },
    setup() {
      return { args };
    },
    template: `
      <Popover :default-open="true">
        <PopoverTrigger as-child>
          <Button variant="outline" size="sm">Priority</Button>
        </PopoverTrigger>
        <ProductPopoverSurface v-bind="args">
          <p class="text-xs font-medium text-muted-foreground">Priority</p>
          <div class="space-y-1">
            <button class="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">No priority</button>
            <button class="w-full rounded-md bg-accent px-2 py-1.5 text-left text-sm">High</button>
            <button class="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">Urgent</button>
          </div>
        </ProductPopoverSurface>
      </Popover>
    `,
  }),
} satisfies Meta<typeof ProductPopoverSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Property: Story = {};

export const CompactMenu: Story = {
  args: { recipe: 'compact-menu', align: 'end' },
  render: (args) => ({
    components: { Popover, PopoverTrigger, ProductPopoverSurface, Button },
    setup() {
      return { args };
    },
    template: `
      <Popover :default-open="true">
        <PopoverTrigger as-child>
          <Button variant="ghost" size="sm">More</Button>
        </PopoverTrigger>
        <ProductPopoverSurface v-bind="args">
          <button class="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">Duplicate</button>
          <button class="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">Move to…</button>
          <button class="w-full rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10">Delete</button>
        </ProductPopoverSurface>
      </Popover>
    `,
  }),
};
