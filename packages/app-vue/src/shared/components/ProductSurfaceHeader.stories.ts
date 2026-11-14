import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Search } from '@lucide/vue';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import ProductSurfaceHeader from './ProductSurfaceHeader.vue';
import { PRODUCT_SURFACE_HEADER_FAMILIES } from './product-surface-header.types';

const meta = {
  title: 'Business/AppVue/ProductSurfaceHeader',
  component: ProductSurfaceHeader,
  tags: ['autodocs'],
  args: { family: 'collection' },
  argTypes: {
    family: { control: 'select', options: PRODUCT_SURFACE_HEADER_FAMILIES },
  },
  render: (args) => ({
    components: { ProductSurfaceHeader, Button, Input, Search },
    setup() {
      return { args };
    },
    template: `
      <div class="overflow-hidden rounded-xl border bg-background" style="container-type: inline-size">
        <ProductSurfaceHeader v-bind="args">
          <h2 class="text-sm font-semibold">Notification inbox</h2>
          <span class="rounded-full bg-[hsl(var(--surface-raised))] px-1.5 text-[11px] tabular-nums text-muted-foreground">128</span>
          <div class="ml-auto flex items-center gap-2">
            <div class="relative hidden sm:block">
              <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input class="h-8 w-48 pl-7" placeholder="Search notifications" />
            </div>
            <Button size="sm" variant="outline">Mark all read</Button>
          </div>
        </ProductSurfaceHeader>
        <div class="space-y-2 p-4">
          <p class="text-sm text-muted-foreground">Collection surface body.</p>
        </div>
      </div>
    `,
  }),
} satisfies Meta<typeof ProductSurfaceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collection: Story = {};

export const Entity: Story = {
  args: { family: 'entity' },
  render: (args) => ({
    components: { ProductSurfaceHeader, Button },
    setup() {
      return { args };
    },
    template: `
      <div class="overflow-hidden rounded-xl border bg-background" style="container-type: inline-size">
        <ProductSurfaceHeader v-bind="args">
          <div class="flex min-w-0 items-center gap-2">
            <div class="min-w-0">
              <h1 class="truncate text-sm font-semibold">Ship the Q4 roadmap review</h1>
              <p class="truncate text-xs text-muted-foreground">Goal · Product · Updated 2 hours ago</p>
            </div>
            <Button class="ml-auto" size="sm">Open</Button>
          </div>
        </ProductSurfaceHeader>
        <div class="p-4 text-sm text-muted-foreground">Entity surface body.</div>
      </div>
    `,
  }),
};

export const Settings: Story = {
  args: { family: 'settings' },
  render: (args) => ({
    components: { ProductSurfaceHeader, Button },
    setup() {
      return { args };
    },
    template: `
      <div class="overflow-hidden rounded-xl border bg-background" style="container-type: inline-size">
        <ProductSurfaceHeader v-bind="args">
          <div>
            <h2 class="text-sm font-semibold">Workspace preferences</h2>
            <p class="text-xs text-muted-foreground">Changes apply to every business surface.</p>
          </div>
          <Button class="ml-auto" size="sm">Save</Button>
        </ProductSurfaceHeader>
        <div class="p-4 text-sm text-muted-foreground">Settings surface body.</div>
      </div>
    `,
  }),
};
