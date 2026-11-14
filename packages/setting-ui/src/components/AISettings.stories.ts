import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onBeforeUnmount, provide, ref } from 'vue';
import type {
  AgentInstance,
  AgentRegistrySnapshot,
  AIProviderConfigClientDTO,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import AISettings from './AISettings.vue';

const now = Date.now();

function nativeInstance(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    instanceId: 'codex-work',
    driver: 'codex',
    name: 'Codex · Work',
    accentColor: '#6469da',
    enabled: true,
    legacyConnectionId: 'connection-codex-work',
    revision: 3,
    createdAt: now - 86_400_000,
    updatedAt: now - 3_600_000,
    ...overrides,
  } as AgentInstance;
}

function registrySnapshot(instances: AgentInstance[]): AgentRegistrySnapshot {
  return { instances, bindings: [] };
}

/**
 * `AISettings` reaches the AI client through the host facade. Storybook binds the
 * host but provides no live AI client, so each story swaps only that facade for a
 * local double and restores it when the story unmounts.
 */
function usePreviewAiFacade() {
  const providers = ref<AIProviderConfigClientDTO[]>([]);
  const original = settingUiHost.useAiFacade;
  settingUiHost.useAiFacade = (() => ({
    providers,
    loadProviders: async () => providers.value,
    invalidateConfiguration: () => undefined,
    composerDefaults: {
      readNewSessionDefault: () => ({ enabled: false, selection: null }),
      writeNewSessionDefault: () => undefined,
      readStickySelection: () => null,
    },
  })) as never;
  onBeforeUnmount(() => {
    settingUiHost.useAiFacade = original;
  });
}

/**
 * The Provider registry is an injected port. Each story keeps a local copy so
 * toggling a provider updates the row instead of snapping back on the refresh
 * the component runs after every mutation.
 */
function renderWithRegistry(initial: AgentInstance[]) {
  return {
    components: { AISettings },
    setup() {
      const snapshot = ref(registrySnapshot(initial.map((item) => ({ ...item }))));
      provide(
        settingUiHost.AI_AGENT_REGISTRY_KEY as symbol,
        {
          list: async () => registrySnapshot(snapshot.value.instances.map((item) => ({ ...item }))),
          execute: async (command: {
            action: string;
            instanceId?: string;
            patch?: { enabled?: boolean; name?: string };
          }) => {
            const target = snapshot.value.instances.find(
              (item) => item.instanceId === command.instanceId,
            );
            if (target && command.patch) Object.assign(target, command.patch);
            return target ?? snapshot.value;
          },
        } as never,
      );
      usePreviewAiFacade();
      return {};
    },
    template: '<AISettings />',
  };
}

const meta = {
  title: 'Business/Setting/AISettings',
  component: AISettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 1064px;"><story /></div>' })],
  argTypes: {},
} satisfies Meta<typeof AISettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () =>
    renderWithRegistry([
      nativeInstance(),
      nativeInstance({
        instanceId: 'claude-work',
        driver: 'claude',
        name: 'Claude Code',
        accentColor: '#d97757',
        legacyConnectionId: 'connection-claude-work',
        revision: 1,
      }),
    ]),
};

export const DisabledProvider: Story = {
  render: () =>
    renderWithRegistry([
      nativeInstance(),
      nativeInstance({
        instanceId: 'antigravity-personal',
        driver: 'antigravity',
        name: 'Antigravity (AGY)',
        accentColor: '#4285f4',
        enabled: false,
        revision: 2,
      }),
    ]),
};

export const LoadingRegistry: Story = {
  render: () => ({
    components: { AISettings },
    setup() {
      provide(
        settingUiHost.AI_AGENT_REGISTRY_KEY as symbol,
        {
          list: () => new Promise(() => undefined),
          execute: async () => null,
        } as never,
      );
      usePreviewAiFacade();
      return {};
    },
    template: '<AISettings />',
  }),
};

export const RegistryError: Story = {
  render: () => ({
    components: { AISettings },
    setup() {
      provide(
        settingUiHost.AI_AGENT_REGISTRY_KEY as symbol,
        {
          list: async () => {
            throw new Error('Agent registry is unavailable on this device.');
          },
          execute: async () => null,
        } as never,
      );
      usePreviewAiFacade();
      return {};
    },
    template: '<AISettings />',
  }),
};
