import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type {
  KnowledgeNoteProjectionSummaryDTO,
  KnowledgeNoteTreeNodeDTO,
} from '@memoflow/repository-contracts';
import KnowledgeNoteCatalog from './KnowledgeNoteCatalog.vue';

const now = Date.now();
const connectionId = 'connection-1';

const notes = [
  {
    id: 'note-1',
    connectionId,
    knowledgeDocumentId: null,
    relativePath: 'engineering/event-driven-architecture.md',
    title: '事件驱动架构评审',
    contentHash: 'hash-1',
    updatedAt: now - 3_600_000,
  },
  {
    id: 'note-2',
    connectionId,
    knowledgeDocumentId: null,
    relativePath: 'engineering/reliable-messaging.md',
    title: '可靠消息投递语义',
    contentHash: 'hash-2',
    updatedAt: now - 86_400_000,
  },
  {
    id: 'note-3',
    connectionId,
    knowledgeDocumentId: null,
    relativePath: 'product/roadmap-2027.md',
    title: '2027 产品路线图草案',
    contentHash: 'hash-3',
    updatedAt: now - 172_800_000,
  },
] as unknown as KnowledgeNoteProjectionSummaryDTO[];

const treeChildren = {
  '': [
    {
      kind: 'directory',
      name: 'engineering',
      relativePath: 'engineering',
      noteCount: 2,
      hasChildren: true,
    },
    {
      kind: 'directory',
      name: 'product',
      relativePath: 'product',
      noteCount: 1,
      hasChildren: true,
    },
    {
      kind: 'note',
      name: 'index.md',
      title: '知识库索引',
      relativePath: 'index.md',
      projectionId: 'note-index',
      knowledgeDocumentId: null,
      contentHash: 'hash-index',
      updatedAt: now,
    },
  ],
  engineering: [
    {
      kind: 'note',
      name: 'event-driven-architecture.md',
      title: '事件驱动架构评审',
      relativePath: 'engineering/event-driven-architecture.md',
      projectionId: 'note-1',
      knowledgeDocumentId: null,
      contentHash: 'hash-1',
      updatedAt: now - 3_600_000,
    },
    {
      kind: 'note',
      name: 'reliable-messaging.md',
      title: '可靠消息投递语义',
      relativePath: 'engineering/reliable-messaging.md',
      projectionId: 'note-2',
      knowledgeDocumentId: null,
      contentHash: 'hash-2',
      updatedAt: now - 86_400_000,
    },
  ],
  product: [
    {
      kind: 'note',
      name: 'roadmap-2027.md',
      title: '2027 产品路线图草案',
      relativePath: 'product/roadmap-2027.md',
      projectionId: 'note-3',
      knowledgeDocumentId: null,
      contentHash: 'hash-3',
      updatedAt: now - 172_800_000,
    },
  ],
} as unknown as Record<string, KnowledgeNoteTreeNodeDTO[]>;

const baseArgs = {
  notes,
  treeChildren,
  expandedDirectories: ['engineering'],
  loadingDirectories: [],
  selectedNoteId: 'note-1',
  searchQuery: '',
  loadedCountLabel: '已加载 3 篇笔记',
  nextCursor: null,
  loading: false,
  loadingMore: false,
  treeLoading: false,
  syncing: false,
  refreshing: false,
  repositoryName: 'memoflow-knowledge',
  repositoryDisplayName: 'memoflow/knowledge',
  defaultBranch: 'main',
  noteCountLabel: '3 篇笔记',
  providerNeedsAttention: false,
  providerWarningLabel: '',
  connections: [],
  selectedConnectionId: connectionId,
  hiddenDirectories: ['.obsidian', 'templates'],
  hiddenNoteCount: 2,
  includeHidden: false,
  closable: true,
};

const meta = {
  title: 'Business/Repository/KnowledgeNoteCatalog',
  component: KnowledgeNoteCatalog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({
      template:
        '<div style="display: flex; height: 560px; width: 360px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem; overflow: hidden;"><story /></div>',
    }),
  ],
  argTypes: {
    notes: { description: '搜索模式的笔记列表' },
    treeChildren: { description: '按父目录分组的树节点' },
    searchQuery: { description: '非空时进入搜索模式' },
    syncing: { description: '远端同步中', control: 'boolean' },
    providerNeedsAttention: { description: '提供方需要处理', control: 'boolean' },
  },
} satisfies Meta<typeof KnowledgeNoteCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tree: Story = {
  args: baseArgs,
};

export const SearchResults: Story = {
  args: { ...baseArgs, searchQuery: '架构' },
};

export const Syncing: Story = {
  args: { ...baseArgs, syncing: true, treeChildren: {} },
};

export const ProviderWarning: Story = {
  args: { ...baseArgs, providerNeedsAttention: true, providerWarningLabel: '授权已过期' },
};

export const Empty: Story = {
  args: { ...baseArgs, notes: [], treeChildren: {}, expandedDirectories: [] },
};
