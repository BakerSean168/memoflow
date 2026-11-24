import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { AIChatPermissionMode, AgentDriverKind } from '@memoflow/ai-contracts';
import type { ComposerModel, ModelCatalog } from '../composables/useAIModelCatalog';
import AIComposerControls from './AIComposerControls.vue';

interface ComposerAgentOption {
  id: string;
  name: string;
  driver: AgentDriverKind;
  enabled: boolean;
  configured: boolean;
  accentColor?: string;
  supportedRuntimeModes?: readonly AIChatPermissionMode[];
  switchBlockedReason?: 'incompatible' | 'busy' | 'loading';
}

const agents: ComposerAgentOption[] = [
  {
    id: 'agent:mastra-main',
    name: 'MemoFlow AI',
    driver: 'mastra',
    enabled: true,
    configured: true,
  },
];

const models: ComposerModel[] = [
  {
    key: 'agent:mastra-main::anthropic::claude-sonnet-4.5',
    agentKey: 'agent:mastra-main',
    agentInstanceId: 'mastra-main',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    modelId: 'claude-sonnet-4.5',
    modelName: 'Claude Sonnet 4.5',
  },
  {
    key: 'agent:mastra-main::anthropic::claude-haiku-4.5',
    agentKey: 'agent:mastra-main',
    agentInstanceId: 'mastra-main',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    modelId: 'claude-haiku-4.5',
    modelName: 'Claude Haiku 4.5',
  },
];

const localAgent: ComposerAgentOption = {
  id: 'local:conn-claude',
  name: 'Claude Code',
  driver: 'claude',
  enabled: true,
  configured: true,
  supportedRuntimeModes: ['approval-required', 'full-access'],
};

const nativeModels: ComposerModel[] = [
  {
    key: 'local:conn-claude::anthropic::claude-opus-4.5',
    agentKey: 'local:conn-claude',
    agentInstanceId: 'conn-claude',
    providerId: 'conn-claude',
    providerName: 'Claude Code',
    modelId: 'claude-opus-4.5',
    modelName: 'Claude Opus 4.5',
    reasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'high',
    serviceTiers: [{ id: 'priority', name: 'Priority' }],
    defaultServiceTier: 'priority',
  },
];

const unavailableCatalog: ModelCatalog = {
  'mastra-main': {
    instanceId: 'mastra-main',
    agentKey: 'agent:mastra-main',
    status: 'error',
    models: [],
    reason: 'discovery_failed',
  },
};

function renderControls(args: Record<string, unknown>) {
  return {
    components: { AIComposerControls },
    data() {
      return { args };
    },
    template: `
      <div class="bg-background p-8">
        <div class="@container w-[42rem] rounded-xl border bg-card p-2 shadow-sm">
          <AIComposerControls v-bind="args" />
        </div>
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AI/AIComposerControls',
  component: AIComposerControls,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    agents,
    selectedAgentId: 'agent:mastra-main',
    models,
    selectedModelKey: models[0]!.key,
    native: false,
    permissionMode: 'approval-required',
    disabled: false,
    loading: false,
  },
  render: (args) => renderControls(args as unknown as Record<string, unknown>),
} satisfies Meta<typeof AIComposerControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: the selected Agent and model are the only visible composer control. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByTestId('ai-chat-model-selector');
    await expect(trigger).toHaveTextContent('Claude Sonnet 4.5');
    await expect(trigger).toBeEnabled();
    await expect(page.queryByTestId('ai-model-picker')).not.toBeInTheDocument();
  },
};

/** Opened picker: the Agent rail, search field, results and permission footer stay visible. */
export const ModelPickerOpen: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('ai-chat-model-selector'));
    await page.findByTestId('ai-model-picker');
    await waitFor(() => expect(page.getByTestId('ai-model-picker')).toBeVisible());
    await waitFor(() => expect(page.getByTestId('ai-model-picker-sidebar')).toBeVisible());
    await expect(page.getByTestId('ai-model-picker-search')).toBeVisible();
    await waitFor(() => expect(page.getAllByTestId('ai-model-picker-option')).toHaveLength(2));
    await expect(page.getByTestId('ai-model-picker-footer')).toBeVisible();
    await expect(page.getByTestId('ai-model-picker-permissions')).toBeVisible();
  },
};

/** Search with no match keeps the picker open and reports the empty result in place. */
export const SearchNoResults: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('ai-chat-model-selector'));
    const search = await page.findByTestId('ai-model-picker-search');
    await userEvent.type(search, 'no-such-model');
    await waitFor(() =>
      expect(page.getByTestId('ai-model-picker-empty')).toHaveTextContent('No matching models'),
    );
    await expect(page.getByTestId('ai-model-picker')).toBeVisible();
  },
};

/** Permission menu: the current mode plus the live description survive keyboard focus. */
export const PermissionMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('ai-chat-model-selector'));
    await userEvent.click(await page.findByTestId('ai-model-picker-permissions'));
    await page.findByTestId('ai-model-picker-permissions-menu');
    await waitFor(() => expect(page.getByTestId('ai-model-picker-permissions-menu')).toBeVisible());
    await expect(page.getByTestId('ai-model-picker-permission-approval-required')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('ai-permission-preview')).not.toBeEmptyDOMElement();
  },
};

/** A native Agent shows reasoning levels and service tiers for the committed model. */
export const NativeModelOptions: Story = {
  args: {
    agents: [localAgent],
    selectedAgentId: localAgent.id,
    models: nativeModels,
    selectedModelKey: nativeModels[0]!.key,
    native: true,
    nativeModelOptions: { reasoningEffort: 'high', serviceTier: 'priority' },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByTestId('ai-chat-model-selector');
    await expect(trigger).toHaveTextContent('Claude Opus 4.5');
    await expect(page.getByTestId('ai-chat-model-effort-label')).toHaveTextContent('high');
    await userEvent.click(trigger);
    await page.findByTestId('ai-model-picker');
    await waitFor(() => expect(page.getByTestId('ai-model-picker-speed')).toBeVisible());
    await expect(page.getByTestId('ai-model-picker-speed-priority')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await waitFor(() => expect(page.getByTestId('ai-model-picker-options')).toBeVisible());
  },
};

/** Disabled composer controls keep the model label but refuse to open the picker. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByTestId('ai-chat-model-selector');
    await expect(trigger).toBeDisabled();
    await expect(page.queryByTestId('ai-model-picker')).not.toBeInTheDocument();
  },
};

/** A failed provider catalog replaces the picker with the settings entry point. */
export const ProviderUnavailable: Story = {
  args: { catalog: unavailableCatalog },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('ai-composer-provider-unavailable')).toHaveTextContent(
      'Open provider settings',
    );
    await expect(page.queryByTestId('ai-chat-model-selector')).not.toBeInTheDocument();
  },
};
