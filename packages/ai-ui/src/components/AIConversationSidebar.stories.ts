import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { userEvent, within } from 'storybook/test';
import type { ConversationAttentionMap } from '../composables/useConversationAttention';
import type {
  AIWorkspaceRecentGoal,
  AIWorkspaceRecentKnowledgeNote,
  ConversationSummary,
} from '../composables/types';
import AIConversationSidebar from './AIConversationSidebar.vue';

const now = Date.now();

const conversations = [
  { id: 'c-1', name: 'Plan the next sprint', runtimeKind: 'builtin', status: 'Active' },
  { id: 'c-2', name: 'Summarize the design review notes', runtimeKind: 'builtin', status: 'Active' },
  {
    id: 'c-3',
    name: 'Refactor the task editor layout',
    runtimeKind: 'local_agent',
    driver: 'codex',
    status: 'Active',
  },
  { id: 'c-4', name: 'Old release checklist', runtimeKind: 'builtin', status: 'Archived' },
] as ConversationSummary[];

const attention: ConversationAttentionMap = {
  'c-1': 'working',
  'c-2': 'approval',
  'c-3': 'failed',
};

const recentGoals: AIWorkspaceRecentGoal[] = [
  { id: 'goal-1', title: 'Ship the settings shell', status: 'Active', updatedAt: now, progress: 64 },
  { id: 'goal-2', title: 'Stabilize desktop updates', status: 'Active', updatedAt: now, progress: null },
];

const recentKnowledgeNotes: AIWorkspaceRecentKnowledgeNote[] = [
  {
    id: 'note-1',
    contextId: 'context-1',
    title: 'Settings shell review',
    path: 'reviews/settings-shell.md',
    updatedAt: now,
  },
];

const meta = {
  title: 'Business/AI/AIConversationSidebar',
  component: AIConversationSidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [() => ({ template: '<div style="height: 680px;"><story /></div>' })],
  args: {
    conversations,
    activeConversationId: 'c-1',
    loading: false,
    recentGoals,
    recentKnowledgeNotes,
  },
} satisfies Meta<typeof AIConversationSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AttentionStatuses: Story = {
  args: { conversationStatuses: attention },
};

export const ExpandedShortcuts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('ai-sidebar-section-recent-goals'));
    await userEvent.click(canvas.getByTestId('ai-sidebar-section-recent-notes'));
  },
};

export const ArchivedConversations: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Archived/i }));
  },
};

export const EmailVerificationRequired: Story = {
  args: { recentKnowledgeNotes: [], recentKnowledgeNotesEmailVerificationRequired: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('ai-sidebar-section-recent-notes'));
  },
};

export const Loading: Story = {
  args: { conversations: [], loading: true },
};

export const Empty: Story = {
  args: { conversations: [], recentGoals: [], recentKnowledgeNotes: [] },
};
