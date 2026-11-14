import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Button, Dialog as AppDialog, Input } from '@memoflow/ui-vue-shadcn';
import ProductDialogShell from './ProductDialogShell.vue';

const meta = {
  title: 'Business/AppVue/ProductDialogShell',
  component: ProductDialogShell,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    testId: 'story-dialog',
    recipe: 'form',
  },
  render: (args) => ({
    components: { AppDialog, ProductDialogShell, Button, Input },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: `
      <AppDialog :open="open" @update:open="open = $event">
        <ProductDialogShell
          v-bind="args"
          :open="open"
          @request-close="open = false"
        >
          <template #icon>
            <span class="flex size-8 items-center justify-center rounded-lg bg-[hsl(var(--surface-raised)/0.66)] text-xs font-semibold text-[hsl(var(--foreground-muted))]">MF</span>
          </template>
          <template #title>Edit task</template>
          <template #description>Update the details shared with the task list and Timeline.</template>
          <div class="space-y-3">
            <label class="text-xs font-medium text-muted-foreground" for="story-dialog-title">Title</label>
            <Input id="story-dialog-title" model-value="Review quarterly roadmap" />
            <label class="text-xs font-medium text-muted-foreground" for="story-dialog-notes">Notes</label>
            <Input id="story-dialog-notes" model-value="Bring the updated capacity numbers." />
          </div>
          <template #footer>
            <Button variant="ghost" @click="open = false">Cancel</Button>
            <Button @click="open = false">Save changes</Button>
          </template>
        </ProductDialogShell>
      </AppDialog>
    `,
  }),
} satisfies Meta<typeof ProductDialogShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FormRecipe: Story = {};

export const BusyCloseDisabled: Story = {
  args: { closeDisabled: true },
  parameters: { layout: 'fullscreen' },
};

export const InspectRecipe: Story = {
  args: { recipe: 'inspect', testId: 'story-dialog-inspect' },
  render: (args) => ({
    components: { AppDialog, ProductDialogShell, Button },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: `
      <AppDialog :open="open" @update:open="open = $event">
        <ProductDialogShell v-bind="args" :open="open" @request-close="open = false">
          <template #title>Task occurrence</template>
          <template #description>Scheduled from the weekly review routine.</template>
          <dl class="grid grid-cols-[7rem_1fr] gap-3 text-sm">
            <dt class="text-muted-foreground">Status</dt>
            <dd>In progress</dd>
            <dt class="text-muted-foreground">Due</dt>
            <dd>Nov 20, 2026 · 17:00</dd>
            <dt class="text-muted-foreground">Assignee</dt>
            <dd>Alex Chen</dd>
          </dl>
          <template #footer>
            <Button variant="outline" @click="open = false">Close</Button>
          </template>
        </ProductDialogShell>
      </AppDialog>
    `,
  }),
};

export const Headerless: Story = {
  args: { headerless: true, testId: 'story-dialog-headerless' },
  render: (args) => ({
    components: { AppDialog, ProductDialogShell, Button },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: `
      <AppDialog :open="open" @update:open="open = $event">
        <ProductDialogShell v-bind="args" :open="open" @request-close="open = false">
          <template #title>Settings</template>
          <div class="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] pb-3">
            <h2 class="text-sm font-semibold">Workspace settings</h2>
            <Button size="sm" variant="ghost" @click="open = false">Done</Button>
          </div>
          <p class="pt-4 text-sm text-muted-foreground">
            The owning surface renders its own header row while the shell still provides the
            accessible dialog name.
          </p>
        </ProductDialogShell>
      </AppDialog>
    `,
  }),
};
