import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { userEvent, within } from 'storybook/test';
import { ok } from '@memoflow/transport-contracts/result';
import type {
  AgentInstance,
  AgentInstanceModelBinding,
  AIProviderConfigClientDTO,
} from '@memoflow/ai-contracts';
import { aiUiHost } from '@memoflow/ai-ui/host';
import NewSessionDefaultSettings from './NewSessionDefaultSettings.vue';

const now = Date.now();
const identityScope = 'storybook';
const stickyKey = `ai:composer:sticky-selection:v1:${encodeURIComponent(identityScope)}`;
const defaultKey = `ai:composer:new-session-default:v1:${encodeURIComponent(identityScope)}`;

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
      try {
        localStorage.removeItem(stickyKey);
        localStorage.removeItem(defaultKey);
        if (options.selection) localStorage.setItem(stickyKey, JSON.stringify(options.selection));
        if (options.savedDefault)
          localStorage.setItem(defaultKey, JSON.stringify({ enabled: true, selection }));
      } catch {
        /* Storybook storage restrictions only drop the seeded selection. */
      }
      provide(
        aiUiHost.AI_CLIENT_KEY as symbol,
        {
          listProviders: async () => ok([provider]),
        } as never,
      );
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
