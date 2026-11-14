import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { FileText, GitBranch } from '@lucide/vue';
import { Badge } from '@memoflow/ui-vue-shadcn';
import DocumentCatalogRow from './DocumentCatalogRow.vue';

const meta = {
  title: 'Business/Repository/DocumentCatalogRow',
  component: DocumentCatalogRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="width: 340px; padding: 0.5rem;"><story /></div>' })],
  argTypes: {
    selected: { description: '是否为当前选中项', control: 'boolean' },
  },
} satisfies Meta<typeof DocumentCatalogRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { selected: false },
  render: (args) => ({
    components: { DocumentCatalogRow, FileText },
    setup: () => ({ args }),
    template: `
      <DocumentCatalogRow v-bind="args">
        <template #icon><FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" /></template>
        事件驱动架构评审
      </DocumentCatalogRow>
    `,
  }),
};

export const Selected: Story = {
  args: { selected: true },
  render: (args) => ({
    components: { DocumentCatalogRow, FileText },
    setup: () => ({ args }),
    template: `
      <DocumentCatalogRow v-bind="args">
        <template #icon><FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" /></template>
        事件驱动架构评审
      </DocumentCatalogRow>
    `,
  }),
};

export const WithMetaAndTrailing: Story = {
  args: { selected: false },
  render: (args) => ({
    components: { DocumentCatalogRow, FileText, Badge, GitBranch },
    setup: () => ({ args }),
    template: `
      <DocumentCatalogRow v-bind="args">
        <template #icon><FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" /></template>
        <template #meta>engineering / event-driven-architecture.md</template>
        <template #trailing>
          <Badge variant="secondary" class="h-5 gap-1 px-1.5 text-[10px] font-normal">
            <GitBranch class="h-3 w-3" /> main
          </Badge>
        </template>
        事件驱动架构评审
      </DocumentCatalogRow>
    `,
  }),
};

export const WithDescription: Story = {
  args: { selected: false },
  render: (args) => ({
    components: { DocumentCatalogRow, FileText },
    setup: () => ({ args }),
    template: `
      <DocumentCatalogRow v-bind="args">
        <template #icon><FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" /></template>
        <template #meta>engineering / reliable-messaging.md</template>
        <template #description>
          梳理事件契约的投递、重试与死信处理，明确各阶段的观测指标与告警阈值。
        </template>
        可靠消息投递语义
      </DocumentCatalogRow>
    `,
  }),
};
