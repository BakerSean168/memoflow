import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { ComposerModel } from '../composables/useAIModelCatalog';
import AIModelTraitsPanel from './AIModelTraitsPanel.vue';

const model = {
  key: 'agent:mastra-main::provider-demo-1::claude-sonnet-4.5',
  agentKey: 'mastra-main',
  agentInstanceId: 'mastra-main',
  providerId: 'provider-demo-1',
  providerName: 'Anthropic',
  modelId: 'claude-sonnet-4.5',
  modelName: 'Claude Sonnet 4.5',
  reasoningEfforts: ['low', 'medium', 'high'],
  defaultReasoningEffort: 'medium',
} as ComposerModel;

const meta = {
  title: 'Business/AI/AIModelTraitsPanel',
  component: AIModelTraitsPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="height: 320px; display: flex;"><story /></div>' })],
  args: {
    model,
    reasoningEfforts: ['low', 'medium', 'high'],
    selectedEffort: 'medium',
    disabled: false,
  },
  argTypes: {
    selectedEffort: { control: 'select', options: ['low', 'medium', 'high'] },
  },
} satisfies Meta<typeof AIModelTraitsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReasoningLevels: Story = {};

export const Locked: Story = {
  args: {
    lockedHint: 'Save the model change before choosing a reasoning level.',
    selectedEffort: 'medium',
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const NoReasoningLevels: Story = {
  args: { model: { ...model, reasoningEfforts: [] }, reasoningEfforts: [] },
};

export const NoModel: Story = {
  args: { model: null, reasoningEfforts: [], selectedEffort: '' },
};
