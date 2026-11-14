import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import ProductEditorFrame from './ProductEditorFrame.vue';

const meta = {
  title: 'Business/AppVue/ProductEditorFrame',
  component: ProductEditorFrame,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    testId: 'story-editor',
    titleId: 'story-editor-title',
    recipe: 'workspace',
  },
  render: (args) => ({
    components: { ProductEditorFrame, Button, Input },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: `
      <ProductEditorFrame v-bind="args" :open="open" @update:open="open = $event">
        <template #title>Edit goal</template>
        <template #description>Changes are visible to everyone in this workspace.</template>
        <div class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground" for="story-editor-name">Name</label>
            <Input id="story-editor-name" model-value="Ship the Q4 roadmap review" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground" for="story-editor-summary">Summary</label>
            <Input id="story-editor-summary" model-value="Align product, design and engineering on the next quarter." />
          </div>
        </div>
        <template #footer>
          <Button variant="ghost" @click="open = false">Cancel</Button>
          <Button @click="open = false">Save goal</Button>
        </template>
      </ProductEditorFrame>
    `,
  }),
} satisfies Meta<typeof ProductEditorFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogPresentation: Story = {};

export const PanelPresentation: Story = {
  args: { presentation: 'panel', paneSize: 'wide' },
  render: (args) => ({
    components: { ProductEditorFrame, Button, Input },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: `
      <main class="relative h-[680px] overflow-hidden rounded-xl border bg-background" style="container-type: inline-size">
        <div class="p-6">
          <h1 class="text-base font-semibold">Goals</h1>
          <p class="text-sm text-muted-foreground">The business pane stays visible behind the editor.</p>
        </div>
        <ProductEditorFrame v-bind="args" :open="open" @update:open="open = $event">
          <template #title>Edit goal</template>
          <template #description>Changes are visible to everyone in this workspace.</template>
          <div class="space-y-4">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="story-panel-name">Name</label>
              <Input id="story-panel-name" model-value="Ship the Q4 roadmap review" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground" for="story-panel-summary">Summary</label>
              <Input id="story-panel-summary" model-value="Align product, design and engineering on the next quarter." />
            </div>
          </div>
          <template #footer>
            <Button variant="ghost" @click="open = false">Cancel</Button>
            <Button @click="open = false">Save goal</Button>
          </template>
        </ProductEditorFrame>
      </main>
    `,
  }),
};
