import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onBeforeUnmount, ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import type {
  AgentInstance,
  AgentInstanceModelBinding,
  AIProviderConfigClientDTO,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import NewSessionDefaultSettings from './NewSessionDefaultSettings.vue';

const now = Date.now();

const provider = {
  id: 'provider-demo-1',
  identityId: 'identity-demo',
  name: 'Anthropic',
  providerDefinitionId: 'anthropic',
  baseUrl: 'https://api.example.test',
  credentialRef: 'credential-demo',
  defaultModel: 'claude-sonnet-4.5',
  isActive: true,
  isDefault: true,
  priority: 0,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
} as AIProviderConfigClientDTO;

const instance: AgentInstance = {
  instanceId: 'mastra-main',
  driver: 'mastra',
  name: 'MemoFlow Assistant',
  accentColor: '#6469da',
  enabled: true,
  revision: 2,
  createdAt: now - 86_400_000,
  updatedAt: now - 3_600_000,
} as AgentInstance;

const binding: AgentInstanceModelBinding = {
  instanceId: 'mastra-main',
  connectionId: 'provider-demo-1',
  modelId: 'claude-sonnet-4.5',
};

const selection = {
  runtimeKind: 'builtin' as const,
  agentInstanceId: 'mastra-main',
  modelKey: 'agent:mastra-main::provider-demo-1::claude-sonnet-4.5',
  reasoningEffort: 'medium',
  permissionMode: 'approval-required' as const,
};

/**
 * `NewSessionDefaultSettings` reads persisted Composer memory through the host
 * AI facade. Storybook installs the host without a live AI client, so the story
 * supplies the two memory reads it needs and restores the facade on unmount.
 */
function usePreviewAiFacade(options: { selection?: typeof selection; savedDefault?: boolean }) {
  const providers = ref<AIProviderConfigClientDTO[]>([provider]);
  const original = settingUiHost.useAiFacade;
  settingUiHost.useAiFacade = (() => ({
    providers,
    loadProviders: async () => providers.value,
    invalidateConfiguration: () => undefined,
    composerDefaults: {
      readNewSessionDefault: () => ({
        enabled: options.savedDefault === true && Boolean(options.selection),
        selection: options.selection ?? null,
      }),
      writeNewSessionDefault: () => undefined,
      readStickySelection: () => options.selection ?? null,
    },
  })) as never;
  onBeforeUnmount(() => {
    settingUiHost.useAiFacade = original;
  });
}

function renderSettings(
  options: {
    selection?: typeof selection;
    instances?: AgentInstance[];
    savedDefault?: boolean;
  } = {},
) {
  return {
    components: { NewSessionDefaultSettings },
    setup() {
      usePreviewAiFacade(options);
      return {
        instances: options.instances ?? [instance],
        bindings: options.selection ? [binding] : [],
        providers: [provider],
      };
    },
    template:
      '<div style="max-width: 760px"><NewSessionDefaultSettings :instances="instances" :bindings="bindings" :providers="providers" /></div>',
  };
}

const meta = {
  title: 'Business/Setting/NewSessionDefaultSettings',
  component: NewSessionDefaultSettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    instances: [instance],
    bindings: [binding],
    providers: [provider],
  },
} satisfies Meta<typeof NewSessionDefaultSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  render: () => renderSettings(),
};

export const ExpandedWithSelection: Story = {
  render: () => renderSettings({ selection }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('ai-new-session-default-toggle'));
  },
};

export const SavedDefault: Story = {
  render: () => renderSettings({ selection, savedDefault: true }),
};

export const NoAgents: Story = {
  render: () => renderSettings({ instances: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('ai-new-session-default-toggle'));
  },
};
