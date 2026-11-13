import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentInstanceSchema,
  LocalAgentStatusSchema,
  type AgentInstance,
  type AgentInstanceModelBinding,
  type AIProviderConfigClientDTO,
  type LocalAgentStatus,
} from '@memoflow/ai-contracts';
import { AI_CLIENT_KEY, AI_LOCAL_AGENT_KEY } from '@setting-ui-test-host/di/keys';
import { productionLocaleMessages } from '@setting-ui-test-host/locales/production-messages';
import { SERVER_STATE_IDENTITY_SCOPE_KEY } from '@setting-ui-test-host/platform/server-state';
import NewSessionDefaultSettings from './NewSessionDefaultSettings.vue';

const SelectStub = defineComponent({
  name: 'SelectStub',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'select-stub' }, slots.default?.());
  },
});
const PassthroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.());
  },
});

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  localStorage.clear();
});

function instance(
  id: string,
  driver: AgentInstance['driver'] = 'mastra',
  overrides: Partial<AgentInstance> = {},
): AgentInstance {
  return AgentInstanceSchema.parse({
    instanceId: id,
    driver,
    name: driver === 'mastra' ? 'Mastra' : 'Claude Code',
    accentColor: '#6469da',
    enabled: true,
    legacyConnectionId: driver === 'mastra' ? undefined : `native-${id}`,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });
}

function setup(
  options: {
    instances?: AgentInstance[];
    bindings?: AgentInstanceModelBinding[];
    nativeStatus?: LocalAgentStatus | null;
  } = {},
) {
  const cachedCatalogConnection = vi.fn(
    async (): Promise<LocalAgentStatus | null> => options.nativeStatus ?? null,
  );
  const wrapper = mount(NewSessionDefaultSettings, {
    props: {
      instances: options.instances ?? [instance('mastra')],
      bindings: options.bindings ?? [
        { instanceId: 'mastra', connectionId: 'provider-1', modelId: 'model-1' },
      ],
      providers: [
        { id: 'provider-1', name: 'AnyRouter' } as unknown as AIProviderConfigClientDTO,
      ],
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
      stubs: {
        Select: SelectStub,
        SelectTrigger: PassthroughStub,
        SelectContent: PassthroughStub,
        SelectItem: PassthroughStub,
        SelectValue: PassthroughStub,
      },
      provide: {
        [AI_CLIENT_KEY as symbol]: {},
        [AI_LOCAL_AGENT_KEY as symbol]: { cachedCatalogConnection },
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'desktop-profile-a',
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, cachedCatalogConnection };
}

function selectAt(wrapper: VueWrapper, index: number) {
  return wrapper.findAllComponents(SelectStub)[index]!;
}
function storedDefault() {
  const raw = localStorage.getItem('ai:composer:new-session-default:v1:desktop-profile-a');
  return raw ? JSON.parse(raw) : null;
}

describe('new conversation default settings', () => {
  it('explains that no Agent is available instead of offering an empty configuration', async () => {
    const { wrapper } = setup({ instances: [] });
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-new-session-default-no-agents"]').text()).toContain(
      'No Agent instances',
    );
    expect(wrapper.find('[data-testid="ai-new-session-default-agent"]').exists()).toBe(false);
  });

  it('saves the Agent, model and runtime permission of a Mastra Agent', async () => {
    const { wrapper } = setup({ instances: [instance('mastra'), instance('claude', 'claude')] });
    await flushPromises();
    await selectAt(wrapper, 0).vm.$emit('update:modelValue', 'mastra');
    await flushPromises();
    await selectAt(wrapper, 1).vm.$emit(
      'update:modelValue',
      'agent:mastra::provider-1::model-1',
    );
    await flushPromises();
    await wrapper.get('[data-testid="ai-new-session-default-enabled"]').trigger('click');
    await wrapper.get('[data-testid="ai-new-session-default-save"]').trigger('click');
    expect(storedDefault()).toEqual({
      enabled: true,
      selection: {
        runtimeKind: 'builtin',
        agentInstanceId: 'mastra',
        modelKey: 'agent:mastra::provider-1::model-1',
      },
    });
    expect(wrapper.get('[data-testid="ai-new-session-default-saved"]').exists()).toBe(true);
  });

  it('saves a native Agent with its verified reasoning effort and permission mode', async () => {
    const { wrapper, cachedCatalogConnection } = setup({
      instances: [instance('claude', 'claude')],
      bindings: [],
      nativeStatus: LocalAgentStatusSchema.parse({
        status: 'ready',
        version: '2.0',
        models: [{ id: 'sonnet', name: 'Sonnet', reasoningEfforts: ['low', 'high'] }],
      }),
    });
    await flushPromises();
    await selectAt(wrapper, 0).vm.$emit('update:modelValue', 'claude');
    await flushPromises();
    expect(cachedCatalogConnection).toHaveBeenCalledWith('native-claude');
    await selectAt(wrapper, 1).vm.$emit('update:modelValue', 'sonnet');
    await selectAt(wrapper, 2).vm.$emit('update:modelValue', 'high');
    await flushPromises();
    // Agent, model, reasoning effort, runtime permission.
    await selectAt(wrapper, 3).vm.$emit('update:modelValue', 'full-access');
    await flushPromises();
    await wrapper.get('[data-testid="ai-new-session-default-enabled"]').trigger('click');
    await wrapper.get('[data-testid="ai-new-session-default-save"]').trigger('click');
    expect(storedDefault()).toEqual({
      enabled: true,
      selection: {
        runtimeKind: 'local_agent',
        connectionId: 'native-claude',
        modelId: 'sonnet',
        reasoningEffort: 'high',
        permissionMode: 'full-access',
      },
    });
  });

  it('keeps the switch disabled until an Agent and model are chosen', async () => {
    const { wrapper } = setup();
    await flushPromises();
    expect(
      wrapper.get('[data-testid="ai-new-session-default-enabled"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('flags a saved default whose Agent is no longer enabled', async () => {
    localStorage.setItem(
      'ai:composer:new-session-default:v1:desktop-profile-a',
      JSON.stringify({
        enabled: true,
        selection: {
          runtimeKind: 'builtin',
          agentInstanceId: 'mastra',
          modelKey: 'agent:mastra::provider-1::model-1',
        },
      }),
    );
    const { wrapper } = setup({ instances: [instance('mastra', 'mastra', { enabled: false })] });
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-new-session-default-unavailable"]').exists()).toBe(true);
  });

  it('reports an Agent without a verified model directory instead of suggesting one', async () => {
    const { wrapper } = setup({
      instances: [instance('claude', 'claude')],
      bindings: [],
      nativeStatus: null,
    });
    await flushPromises();
    await selectAt(wrapper, 0).vm.$emit('update:modelValue', 'claude');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-new-session-default-no-models"]').exists()).toBe(true);
  });
});
