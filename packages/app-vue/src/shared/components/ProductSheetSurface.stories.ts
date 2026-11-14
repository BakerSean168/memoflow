import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Button, Sheet } from '@memoflow/ui-vue-shadcn';
import ProductSheetSurface from './ProductSheetSurface.vue';

const meta = {
  title: 'Business/AppVue/ProductSheetSurface',
  component: ProductSheetSurface,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Notification filters',
    description: 'Narrow a busy inbox without leaving the collection.',
    side: 'right',
    width: 'md',
    hideClose: false,
    testId: 'story-sheet',
  },
  render: (args) => ({
    components: { Sheet, ProductSheetSurface, Button },
    setup() {
      return { args };
    },
    template: `
      <Sheet :open="true">
        <ProductSheetSurface v-bind="args">
          <div class="space-y-4 px-5 py-4">
            <div>
              <h2 class="text-sm font-semibold">Notification filters</h2>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                Narrow a busy inbox without leaving the collection.
              </p>
            </div>
            <div class="space-y-2 text-sm">
              <p class="font-medium">Status</p>
              <label class="flex items-center gap-2"><input type="checkbox" checked /> Unread</label>
              <label class="flex items-center gap-2"><input type="checkbox" /> Mentioned</label>
              <label class="flex items-center gap-2"><input type="checkbox" checked /> Scheduled</label>
            </div>
            <Button class="w-full">Apply filters</Button>
          </div>
        </ProductSheetSurface>
      </Sheet>
    `,
  }),
} satisfies Meta<typeof ProductSheetSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RightSide: Story = {};

export const NarrowLeft: Story = {
  args: { side: 'left', width: 'sm', hideClose: true, testId: 'story-sheet-left' },
};
