import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import {
  AgentRegistrySnapshotSchema,
  type AgentConversationSelection,
  type AIModelInfo,
} from '@memoflow/contracts/ai';
import { useAIModelSelection } from './useAIModelSelection';

afterEach(() => localStorage.clear());
const provider = {
  id: 'provider-1',
  name: 'AnyRouter',
  isDefault: true,
  defaultModel: 'model-default',
  availableModels: [
    { id: 'model-default', name: 'Default' },
    { id: 'model-custom', name: 'Custom' },
  ],
};
const instance = (id: string, enabled = true) => ({
  instanceId: id,
  driver: 'mastra' as const,
  name: id,
  accentColor: '#6469da',
  enabled,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
});
function mounted(input: {
  currentConversation?: string;
  instances?: ReturnType<typeof instance>[];
  bindings?: Array<{ instanceId: string; connectionId: string; modelId: string }>;
  withRegistry?: boolean;
  initialCatalogs?: Record<string, AIModelInfo[]>;
  readConversationSelection?: (id: string) => Promise<AgentConversationSelection | null>;
}) {
  const chatConversationId = ref(input.currentConversation ?? '');
  const providers = ref([provider]);
  const registry = ref(
    AgentRegistrySnapshotSchema.parse({
      instances: input.instances ?? [instance('mastra'), instance('mastra-anyrouter')],
      bindings: input.bindings ?? [
        { instanceId: 'mastra', connectionId: 'provider-1', modelId: 'model-default' },
        { instanceId: 'mastra-anyrouter', connectionId: 'provider-1', modelId: 'model-custom' },
      ],
    }),
  );
  const catalogs = ref<Record<string, AIModelInfo[]>>(
    input.initialCatalogs ?? {
      'provider-1': [
        { id: 'model-default', name: 'Default' },
        { id: 'model-custom', name: 'Custom' },
      ],
    },
  );
  let selection!: ReturnType<typeof useAIModelSelection>;
  const Root = defineComponent({
    setup() {
      selection = useAIModelSelection({
        providers,
        chatConversationId,
        readConversationSelection: input.readConversationSelection,
        ...(input.withRegistry === false
          ? {}
          : { agentRegistrySnapshot: registry, modelCatalogs: catalogs }),
      });
      return () => h('div');
    },
  });
  const wrapper = mount(Root, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { common: { unknown: 'Unknown' } } },
        }),
      ],
    },
  });
  return { wrapper, selection, registry, catalogs, chatConversationId, providers };
}

describe('model selection bound to explicit Mastra Agent instances', () => {
  it('preserves an explicit non-default preference until the live directory arrives', async () => {
    const key = 'agent:mastra::provider-1::model-custom';
    localStorage.setItem('ai:last-model-key', key);
    const { wrapper, selection, catalogs } = mounted({ initialCatalogs: {} });
    expect(localStorage.getItem('ai:last-model-key')).toBe(key);
    expect(selection.canSendMessage.value).toBe(false);
    catalogs.value = {
      'provider-1': [
        { id: 'model-default', name: 'Default' },
        { id: 'model-custom', name: 'Custom' },
      ],
    };
    await nextTick();
    expect(selection.selectedModelKey.value).toBe(key);
    expect(selection.canSendMessage.value).toBe(true);
    wrapper.unmount();
  });

  it('keeps the selected tuple and preference when a browse refresh loses directory eligibility', async () => {
    const { wrapper, selection, catalogs } = mounted({});
    const key = 'agent:mastra::provider-1::model-custom';
    expect(selection.selectModel(key)).toBe('selected');
    catalogs.value = { 'provider-1': [] };
    await nextTick();
    expect(selection.selectedModelKey.value).toBe(key);
    expect(localStorage.getItem('ai:last-model-key')).toBe(key);
    expect(selection.selectedModel.value).toBeNull();
    expect(selection.canSendMessage.value).toBe(false);
    catalogs.value = { 'provider-1': [{ id: 'model-custom', name: 'Custom' }] };
    await nextTick();
    expect(selection.selectedModelKey.value).toBe(key);
    expect(selection.canSendMessage.value).toBe(true);
    wrapper.unmount();
  });

  it('selects an empty Agent independently and never silently switches to a configured one', async () => {
    const { wrapper, selection } = mounted({
      instances: [instance('mastra'), instance('work')],
      bindings: [{ instanceId: 'mastra', connectionId: 'provider-1', modelId: 'model-default' }],
    });
    expect(selection.selectAgent('work')).toBe('selected');
    expect(selection.selectedAgentId.value).toBe('work');
    expect(selection.selectedModelKey.value).toBe('');
    selection.syncSelectedModel('agent:mastra::provider-1::model-default');
    expect(selection.selectedModelKey.value).toBe('');
    expect(selection.canSendMessage.value).toBe(false);
    wrapper.unmount();
  });
  it('does not invent a saved model after the live catalog has settled empty or removed it', () => {
    const { wrapper, selection, catalogs } = mounted({});
    catalogs.value = { 'provider-1': [] };
    expect(selection.allModelOptions.value).toEqual([]);
    catalogs.value = { 'provider-1': [{ id: 'new-model', name: 'New model' }] };
    expect(selection.allModelOptions.value.map((model) => model.modelId)).toEqual([
      'new-model',
      'new-model',
    ]);
    wrapper.unmount();
  });
  it('offers verified inventory models only from the selected Agent connection', async () => {
    const { wrapper, selection, catalogs } = mounted({});
    catalogs.value = {
      'provider-1': [
        { id: 'model-default', name: 'Default' },
        { id: 'model-custom', name: 'Custom' },
      ],
    };
    await nextTick();
    selection.selectAgent('mastra-anyrouter');
    expect(selection.selectedAgentModels.value.map((model) => model.modelId)).toEqual([
      'model-custom',
      'model-default',
    ]);
    expect(
      selection.selectedAgentModels.value.every(
        (model) => model.agentInstanceId === 'mastra-anyrouter',
      ),
    ).toBe(true);
    expect(selection.selectModel('agent:mastra-anyrouter::provider-1::model-default')).toBe(
      'selected',
    );
    expect(selection.selectedAgentId.value).toBe('mastra-anyrouter');
    wrapper.unmount();
  });

  it('groups only allowed models by Agent identity and never exposes unbound provider models', async () => {
    const { wrapper, selection, registry } = mounted({});
    expect(selection.allModelOptions.value.map((item) => item.key)).toEqual([
      'agent:mastra::provider-1::model-default',
      'agent:mastra::provider-1::model-custom',
      'agent:mastra-anyrouter::provider-1::model-custom',
      'agent:mastra-anyrouter::provider-1::model-default',
    ]);
    expect(selection.modelGroups.value.map((group) => group.providerName)).toEqual([
      'mastra · AnyRouter',
      'mastra-anyrouter · AnyRouter',
    ]);
    selection.selectModel('agent:mastra-anyrouter::provider-1::model-custom');
    expect(selection.selectedModel.value).toMatchObject({
      agentInstanceId: 'mastra-anyrouter',
      providerId: 'provider-1',
      modelId: 'model-custom',
    });
    registry.value = AgentRegistrySnapshotSchema.parse({
      instances: [instance('mastra'), instance('mastra-anyrouter', false)],
      bindings: [
        { instanceId: 'mastra', connectionId: 'provider-1', modelId: 'model-default' },
        { instanceId: 'mastra-anyrouter', connectionId: 'provider-1', modelId: 'model-custom' },
      ],
    });
    await nextTick();
    expect(selection.allModelOptions.value).toHaveLength(2);
    expect(selection.selectedModel.value?.agentInstanceId).not.toBe('mastra-anyrouter');
    wrapper.unmount();
  });

  it('hides a disabled selection without deleting its model preference and restores it on re-enable', async () => {
    const { wrapper, selection, registry } = mounted({});
    const key = 'agent:mastra-anyrouter::provider-1::model-custom';
    expect(selection.selectModel(key)).toBe('selected');
    const preference = localStorage.getItem('ai:last-model-key');
    registry.value.instances[1]!.enabled = false;
    await nextTick();
    expect(selection.selectedModel.value).toBeNull();
    expect(selection.canSendMessage.value).toBe(false);
    expect(selection.allModelOptions.value).toHaveLength(2);
    expect(localStorage.getItem('ai:last-model-key')).toBe(preference);
    registry.value.instances[1]!.enabled = true;
    await nextTick();
    expect(selection.selectedModelKey.value).toBe(key);
    expect(selection.canSendMessage.value).toBe(true);
    wrapper.unmount();
  });

  it('exposes one exact historical provider-only model only for the original conversation', () => {
    localStorage.setItem(
      'ai:conversation-model-map',
      JSON.stringify({
        'old-chat': 'provider-1::model-custom',
      }),
    );
    const { wrapper, selection, chatConversationId } = mounted({
      currentConversation: 'old-chat',
      instances: [instance('mastra')],
      bindings: [],
    });
    expect(selection.allModelOptions.value).toEqual([
      expect.objectContaining({
        key: 'provider-1::model-custom',
        providerId: 'provider-1',
        modelId: 'model-custom',
      }),
    ]);
    expect(selection.selectedModel.value?.agentInstanceId).toBeUndefined();
    chatConversationId.value = '';
    expect(selection.allModelOptions.value).toEqual([]);
    expect(selection.canSendMessage.value).toBe(false);
    wrapper.unmount();
  });

  it('does not replace a missing historical model with another Agent automatically', () => {
    localStorage.setItem(
      'ai:conversation-model-map',
      JSON.stringify({
        'old-chat': 'provider-deleted::retired-model',
      }),
    );
    const { wrapper, selection } = mounted({ currentConversation: 'old-chat' });
    expect(selection.selectedModel.value).toBeNull();
    expect(selection.selectedModelKey.value).toBe('');
    expect(selection.allModelOptions.value).toHaveLength(4);
    wrapper.unmount();
  });

  it('remains compatible with the pre-registry model selection format for older hosts', () => {
    const { wrapper, selection } = mounted({ withRegistry: false });
    expect(selection.allModelOptions.value.map((item) => item.key)).toEqual([
      'provider-1::model-default',
      'provider-1::model-custom',
    ]);
    expect(selection.selectedModel.value?.agentInstanceId).toBeUndefined();
    wrapper.unmount();
  });
  it('selects another Mastra instance in the same conversation and remembers its next-turn model', () => {
    localStorage.setItem(
      'ai:conversation-model-map',
      JSON.stringify({ bound: 'agent:mastra::provider-1::model-default' }),
    );
    const { wrapper, selection } = mounted({ currentConversation: 'bound' });
    expect(selection.selectModel('agent:mastra-anyrouter::provider-1::model-custom')).toBe(
      'selected',
    );
    expect(selection.selectedModel.value?.agentInstanceId).toBe('mastra-anyrouter');
    expect(JSON.parse(localStorage.getItem('ai:conversation-model-map') || '{}').bound).toBe(
      'agent:mastra-anyrouter::provider-1::model-custom',
    );
    expect(selection.selectModel('unknown')).toBe('unavailable');
    wrapper.unmount();
  });
  it('restores the exact host selection after losing browser-local state and keeps authority while loading', async () => {
    const { wrapper, selection } = mounted({
      currentConversation: 'restored',
      readConversationSelection: async () => ({
        agentInstanceId: 'mastra-anyrouter',
        providerId: 'provider-1',
        modelId: 'model-custom',
      }),
    });
    expect(selection.canSendMessage.value).toBe(false);
    expect(selection.selectModel('agent:mastra::provider-1::model-default')).toBe('unavailable');
    await nextTick();
    expect(selection.selectedModel.value).toMatchObject({
      agentInstanceId: 'mastra-anyrouter',
      modelId: 'model-custom',
    });
    expect(selection.canSendMessage.value).toBe(true);
    expect(selection.selectModel('agent:mastra::provider-1::model-default')).toBe('selected');
    wrapper.unmount();
  });

  it('restores a pending next-turn instance across remount without overwriting it with the last executed instance', async () => {
    localStorage.setItem(
      'ai:conversation-model-map',
      JSON.stringify({ bound: 'agent:mastra-anyrouter::provider-1::model-custom' }),
    );
    const { wrapper, selection, catalogs } = mounted({
      currentConversation: 'bound',
      readConversationSelection: async () => ({
        agentInstanceId: 'mastra',
        providerId: 'provider-1',
        modelId: 'model-default',
      }),
    });
    await nextTick();
    expect(selection.selectedModel.value?.agentInstanceId).toBe('mastra-anyrouter');
    catalogs.value = {
      'provider-1': [
        { id: 'model-custom', name: 'Custom' },
        { id: 'model-default', name: 'Default' },
      ],
    };
    await nextTick();
    expect(selection.selectedModel.value?.agentInstanceId).toBe('mastra-anyrouter');
    expect(selection.canSendMessage.value).toBe(true);
    wrapper.unmount();
  });

  it('allows choosing a bound model in an unclaimed conversation instead of creating another conversation', async () => {
    const { wrapper, selection, chatConversationId } = mounted({
      currentConversation: 'empty-shell',
      readConversationSelection: async () => null,
    });
    await nextTick();
    expect(selection.selectModel('agent:mastra-anyrouter::provider-1::model-custom')).toBe(
      'selected',
    );
    expect(chatConversationId.value).toBe('empty-shell');
    expect(selection.canSendMessage.value).toBe(true);
    wrapper.unmount();
  });

  it('disables sends if the host selection cannot be loaded even with a valid local model cache', async () => {
    localStorage.setItem(
      'ai:conversation-model-map',
      JSON.stringify({ restored: 'agent:mastra::provider-1::model-default' }),
    );
    const { wrapper, selection } = mounted({
      currentConversation: 'restored',
      readConversationSelection: async () => {
        throw new Error('offline');
      },
    });
    await nextTick();
    expect(selection.canSendMessage.value).toBe(false);
    expect(selection.selectModel('agent:mastra::provider-1::model-default')).toBe('unavailable');
    wrapper.unmount();
  });
});
