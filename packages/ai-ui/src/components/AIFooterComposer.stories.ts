import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type {
  AIWorkspaceRecentGoal,
  AIWorkspaceRecentKnowledgeNote,
  AIWorkspaceRecentTask,
  ChatModelOption,
  ComposerAttachment,
  ComposerContextEntity,
} from '../composables/types';
import AIFooterComposer from './AIFooterComposer.vue';

const now = Date.now();

const models: ChatModelOption[] = [
  {
    key: 'agent:mastra-main::provider-demo-1::claude-sonnet-4.5',
    agentInstanceId: 'mastra-main',
    providerId: 'provider-demo-1',
    providerName: 'Anthropic',
    modelId: 'claude-sonnet-4.5',
    modelName: 'Claude Sonnet 4.5',
  },
  {
    key: 'agent:mastra-main::provider-demo-1::claude-haiku-4.5',
    agentInstanceId: 'mastra-main',
    providerId: 'provider-demo-1',
    providerName: 'Anthropic',
    modelId: 'claude-haiku-4.5',
    modelName: 'Claude Haiku 4.5',
  },
];

const modelGroups = [
  {
    providerId: 'provider-demo-1',
    providerName: 'Anthropic',
    models,
  },
];

const attachments: ComposerAttachment[] = [
  {
    id: 'attachment-1',
    size: 24_576,
    mediaType: 'image/png',
    filename: 'settings-shell.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  },
  {
    id: 'attachment-2',
    size: 8_192,
    mediaType: 'text/markdown',
    filename: 'release-notes.md',
    data: 'data:text/markdown;base64,IyBSZWxlYXNlIG5vdGVz',
  },
];

const contextEntities: ComposerContextEntity[] = [
  { entityType: 'goal', id: 'goal-1', label: 'Ship the settings shell', origin: 'explicit' },
  { entityType: 'task', id: 'task-1', label: 'Review the AI footer', origin: 'surface' },
];

const recentGoals: AIWorkspaceRecentGoal[] = [
  { id: 'goal-1', title: 'Ship the settings shell', status: 'Active', updatedAt: now, progress: 64 },
];

const recentTasks: AIWorkspaceRecentTask[] = [
  { id: 'task-1', title: 'Review the AI footer', updatedAt: now },
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
  title: 'Business/AI/AIFooterComposer',
  component: AIFooterComposer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 780px;"><story /></div>' })],
  args: {
    modelValue: '',
    loading: false,
    canSend: false,
    modelGroups,
    selectedModelKey: models[0]!.key,
    recentGoals,
    recentTasks,
    recentKnowledgeNotes,
  },
  render: (args) => ({
    components: { AIFooterComposer },
    setup() {
      const draft = ref(args.modelValue);
      return { args, draft };
    },
    template:
      '<AIFooterComposer v-bind="args" :model-value="draft" @update:model-value="draft = $event" />',
  }),
} satisfies Meta<typeof AIFooterComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithDraft: Story = {
  args: { modelValue: 'Draft a short update for the team.', canSend: true },
};

export const AttachmentsAndContext: Story = {
  args: {
    modelValue: 'Use the attached review notes to update the goal.',
    canSend: true,
    attachments,
    contextEntities,
  },
};

export const LocalAgent: Story = {
  args: {
    localAgent: true,
    modelValue: 'Inspect the failing test and propose a fix.',
    canSend: true,
  },
};

export const Streaming: Story = {
  args: {
    modelValue: 'Summarize what changed in the settings shell.',
    loading: true,
    canSend: false,
  },
};

export const CompactDensity: Story = {
  args: { density: 'compact', modelValue: 'Quick question about today’s plan.', canSend: true },
};

export const NoModels: Story = {
  args: { modelGroups: [], selectedModelKey: '' },
};
