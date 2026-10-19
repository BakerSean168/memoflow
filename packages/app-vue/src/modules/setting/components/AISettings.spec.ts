import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeAgentFlowFixture, type NativeProbeFailure } from '@memoflow/ai/testing';
import { ref } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentInstanceSchema,
  AgentRegistryCommandSchema,
  AIProviderConfigClientDTOSchema,
  LocalAgentConnectionSchema,
  LocalAgentStatusSchema,
  type AgentInstance,
  type AgentInstanceModelBinding,
  type AIProviderConfigClientDTO,
  type LocalAgentAuthState,
  type LocalAgentConnection,
  type LocalAgentStatus,
  type ProbeAIProviderConnectionRes,
} from '@memoflow/contracts/ai';
import { ok } from '@memoflow/contracts/result';
import {
  AI_LOCAL_AGENT_KEY,
  AI_CLIENT_KEY,
  AI_AGENT_REGISTRY_KEY,
  AI_CONFIGURATION_REVISION_KEY,
  DESKTOP_BRIDGE_KEY,
} from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import AISettings from './AISettings.vue';
import { SERVER_STATE_IDENTITY_SCOPE_KEY } from '../../../platform/server-state';
import MastraAgentSettings from './MastraAgentSettings.vue';

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  localStorage.clear();
});
function provider(id = '11111111-1111-4111-8111-111111111111', name = 'Saved service') {
  return AIProviderConfigClientDTOSchema.parse({
    id,
    identityId: '33333333-3333-4333-8333-333333333333',
    name,
    providerDefinitionId: 'openai',
    baseUrl: 'https://api.example.com/v1',
    credentialRef: 'opaque-host-secret',
    defaultModel: 'model-1',
    isActive: true,
    isDefault: false,
    priority: 1,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  });
}
function instance(id: string, driver: AgentInstance['driver'] = 'mastra') {
  return AgentInstanceSchema.parse({
    instanceId: id,
    driver,
    name: driver === 'claude' ? 'Claude Code' : driver === 'mastra' ? 'Mastra' : driver,
    accentColor: '#6469da',
    enabled: true,
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  });
}
function probeResult(): ProbeAIProviderConnectionRes {
  return {
    onboardingId: 'single-use-onboarding-handle',
    expiresAt: Date.now() + 60000,
    catalogId: 'custom',
    baseUrl: 'https://api.example.com/v1',
    credential: { status: 'valid' },
    discovery: { status: 'available', source: 'provider_api' },
    models: [
      { id: 'model-1', name: 'Model One' },
      { id: 'model-2', name: 'Model Two' },
    ],
    warnings: [],
  };
}
async function setup(
  options: {
    native?: boolean;
    bound?: boolean;
    extra?: boolean;
    noRegistry?: boolean;
    dom?: boolean;
    configured?: Array<AgentInstance['driver']>;
  } = {},
) {
  let instances: AgentInstance[] = [instance('mastra')];
  if (options.native)
    instances.push(
      ...(['codex', 'claude', 'pi', 'dsh', 'antigravity'] as const).map((driver) =>
        instance(driver, driver),
      ),
    );
  if (options.extra)
    instances.push({ ...instance('mastra-other'), name: 'Other Agent', revision: 1 });
  let providers: AIProviderConfigClientDTO[] = options.bound ? [provider()] : [];
  let bindings: AgentInstanceModelBinding[] = options.bound
    ? [
        {
          instanceId: 'mastra',
          connectionId: '11111111-1111-4111-8111-111111111111',
          modelId: 'model-1',
        },
      ]
    : [];
  let native: LocalAgentConnection[] = [];
  for (const driver of options.configured ?? []) {
    const item = instances.find((entry) => entry.instanceId === driver);
    if (!item) continue;
    item.legacyConnectionId = `native-${driver}`;
    native.push(
      LocalAgentConnectionSchema.parse({
        id: item.legacyConnectionId,
        driver,
        instanceSlug: driver,
        name: item.name,
        executablePath: driver === 'antigravity' ? 'C:\\opt\\agy-server\\agy_acp_server.exe' : driver,
        enabled: true,
        writeScopes: [],
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  }
  const epoch = ref(0);
  const client = {
    listProviders: vi.fn(async () => ok([...providers])),
    getProviderCatalog: vi.fn(async () => ok([])),
    updateProvider: vi.fn(async () => ok(provider())),
    deleteProvider: vi.fn(async () => ok(undefined)),
    testProvider: vi.fn(async () => ok({ ok: true })),
    probeProviderConnection: vi.fn(async () => ok(probeResult())),
    probeProviderReplacement: vi.fn(async () => ok(probeResult())),
    testProviderOnboardingModel: vi.fn(async () =>
      ok({ ok: true, modelId: 'manual-model', latencyMs: 1 }),
    ),
    commitProviderOnboarding: vi.fn(async () => {
      const next = provider('22222222-2222-4222-8222-222222222222');
      providers.push(next);
      return ok(next);
    }),
    commitProviderReplacement: vi.fn(async () => {
      providers = providers.map((item) => ({ ...item, version: item.version + 1 }));
      return ok(providers[0]);
    }),
    refreshProviderModels: vi.fn(async () =>
      ok({
        providerId: '11111111-1111-4111-8111-111111111111',
        models: [
          { id: 'model-1', name: 'Model One' },
          { id: 'model-2', name: 'Model Two' },
        ],
        fetchedAt: Date.now(),
      }),
    ),
  };
  const localClient = {
    listConnections: vi.fn(async () => [...native]),
    saveConnection: vi.fn(),
    probeDefaultDriver: vi.fn(async (): Promise<LocalAgentStatus> => ({
      status: 'not_installed',
      message: 'Not installed',
    })),
    probeConnection: vi.fn(async (): Promise<LocalAgentStatus> => ({
      status: 'ready',
      models: [{ id: 'native-model', name: 'Native Model' }],
      version: '1.0',
    })),
    startLogin: vi.fn(async (): Promise<LocalAgentAuthState> => ({
      phase: 'waiting',
      flowId: 'flow-1',
      authorizationUrl:
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture&redirect_uri=http%3A%2F%2F127.0.0.1%3A43179%2F&response_type=code&state=state-1',
      expiresAt: Date.now() + 300_000,
      failure: null,
    })),
    loginStatus: vi.fn(async (): Promise<LocalAgentAuthState> => ({
      phase: 'waiting',
      flowId: 'flow-1',
      authorizationUrl: null,
      expiresAt: Date.now() + 300_000,
      failure: null,
    })),
    cancelLogin: vi.fn(async (): Promise<LocalAgentAuthState> => ({
      phase: 'cancelled',
      flowId: 'flow-1',
      authorizationUrl: null,
      expiresAt: null,
      failure: null,
    })),
    completeLogin: vi.fn(),
    signOut: vi.fn(async (): Promise<LocalAgentAuthState> => ({
      phase: 'idle',
      flowId: null,
      authorizationUrl: null,
      expiresAt: null,
      failure: null,
    })),
  };
  const bridge = { invoke: vi.fn(async () => ({ ok: true })) };
  const registry = {
    list: vi.fn(async () => ({ instances: [...instances], bindings: [...bindings] })),
    execute: vi.fn(async (raw: unknown) => {
      const command = AgentRegistryCommandSchema.parse(raw);
      if (command.action === 'list') return { instances: [...instances], bindings: [...bindings] };
      if (command.action === 'conversation_selection') return null;
      if (command.action === 'create') {
        if (instances.some((item) => item.instanceId === command.instance.instanceId))
          throw new Error('CONFLICT');
        const saved = AgentInstanceSchema.parse({
          ...command.instance,
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        if (saved.driver !== 'mastra') saved.legacyConnectionId = `native-${saved.instanceId}`;
        instances.push(saved);
        if (saved.driver !== 'mastra')
          native.push(
            LocalAgentConnectionSchema.parse({
              id: saved.legacyConnectionId,
              driver: saved.driver,
              instanceSlug: saved.instanceId,
              name: saved.name,
              executablePath: saved.nativeConfig?.executablePath ?? saved.driver,
              homePath: saved.nativeConfig?.homePath,
              enabled: saved.enabled,
              writeScopes: saved.nativeConfig?.writeScopes ?? [],
              revision: 1,
              createdAt: 1,
              updatedAt: 1,
            }),
          );
        return saved;
      }
      const old = instances.find((item) => item.instanceId === command.instanceId);
      if (!old || old.revision !== command.expectedRevision) throw new Error('CONFLICT');
      if (command.action === 'remove') {
        instances = instances.filter((item) => item.instanceId !== command.instanceId);
        bindings = bindings.filter((item) => item.instanceId !== command.instanceId);
        native = native.filter((item) => item.id !== old.legacyConnectionId);
        return null;
      }
      const next = AgentInstanceSchema.parse({
        ...old,
        ...(command.action === 'update' ? command.patch : {}),
        revision: old.revision + 1,
      });
      if (next.driver !== 'mastra') {
        next.legacyConnectionId ??= `native-${next.instanceId}`;
        const record = LocalAgentConnectionSchema.parse({
          id: next.legacyConnectionId,
          driver: next.driver,
          instanceSlug: next.instanceId,
          name: next.name,
          executablePath: next.nativeConfig?.executablePath ?? next.driver,
          homePath: next.nativeConfig?.homePath,
          enabled: next.enabled,
          writeScopes: next.nativeConfig?.writeScopes ?? [],
          revision: next.revision,
          createdAt: 1,
          updatedAt: 1,
        });
        native = [...native.filter((item) => item.id !== record.id), record];
      }
      instances = instances.map((item) => (item.instanceId === command.instanceId ? next : item));
      if (command.action === 'bind')
        bindings = [
          ...bindings.filter(
            (item) =>
              item.instanceId !== command.instanceId || item.connectionId !== command.connectionId,
          ),
          {
            instanceId: command.instanceId,
            connectionId: command.connectionId,
            modelId: command.modelId,
          },
        ];
      if (command.action === 'unbind')
        bindings = bindings.filter(
          (item) =>
            item.instanceId !== command.instanceId || item.connectionId !== command.connectionId,
        );
      return next;
    }),
  };
  const wrapper = mount(AISettings, {
    attachTo: options.dom ? document.body : undefined,
    global: {
      stubs: { teleport: !options.dom, DialogContent: { template: '<div><slot /></div>' } },
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
      provide: {
        [AI_CLIENT_KEY as symbol]: client,
        [AI_CONFIGURATION_REVISION_KEY as symbol]: epoch,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'desktop-profile-a',
        ...(options.native ? { [AI_LOCAL_AGENT_KEY as symbol]: localClient } : {}),
        ...(!options.noRegistry ? { [AI_AGENT_REGISTRY_KEY as symbol]: registry } : {}),
        [DESKTOP_BRIDGE_KEY as symbol]: bridge,
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return { wrapper, client, registry, localClient, epoch, bridge };
}
async function openIdentity(wrapper: VueWrapper, driver = 'mastra') {
  await wrapper.get('[data-testid="ai-provider-add"]').trigger('click');
  await flushPromises();
  await wrapper.get(`[data-testid="ai-provider-catalog-${driver}"]`).trigger('click');
  await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
  await flushPromises();
}
async function configure(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="ai-endpoint"]').setValue('https://api.example.com/v1');
  await wrapper.get('[data-testid="ai-api-key"]').setValue('sk-private-fixture');
  await wrapper.get('[data-testid="ai-connection-verify"]').trigger('click');
  await flushPromises();
}

describe('T3-style Agent settings and direct endpoint configuration', () => {
  it('shows a real default Mastra with a single list enable switch and no vendor catalogue', async () => {
    const { wrapper, client, localClient } = await setup();
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="ai-provider-toggle-mastra"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-provider-detail-toggle"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-endpoint"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-api-key"]').attributes('type')).toBe('password');
    expect(client.getProviderCatalog).not.toHaveBeenCalled();
    expect(localClient.listConnections).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toMatch(/OpenRouter|DeepSeek|Gemini/);
  });
  it('puts ordinary deletion and built-in restoration in the detail header', async () => {
    const { wrapper, registry } = await setup({ extra: true });
    expect(wrapper.find('[data-testid="ai-agent-delete"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-provider-toggle-mastra"]').trigger('click');
    await flushPromises();
    const reset = wrapper.get('header [data-testid="ai-agent-reset"]');
    expect(reset.attributes('title')).toContain('keep model connections');
    await reset.trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'reset',
      instanceId: 'mastra',
      expectedRevision: 1,
    });
    await wrapper.get('[data-testid="ai-provider-select-agent:mastra-other"]').trigger('click');
    expect(wrapper.find('header [data-testid="ai-agent-delete"]').exists()).toBe(true);
    expect(wrapper.find('footer [data-testid="ai-agent-delete"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-agent-delete"]').trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'remove',
      instanceId: 'mastra-other',
      expectedRevision: 1,
    });
    expect(wrapper.find('[data-testid="ai-provider-select-agent:mastra"]').exists()).toBe(true);
  });
  it('keeps the instance editor when an auxiliary request fails, and keeps it on refresh failure', async () => {
    const { wrapper, client, registry, localClient } = await setup({ native: true, bound: true });
    client.listProviders.mockRejectedValueOnce(new Error('provider list unavailable'));
    localClient.listConnections.mockRejectedValueOnce(new Error('native unavailable'));
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-provider-list"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-endpoint"]').element).toHaveProperty(
      'value',
      'https://api.example.com/v1',
    );
    expect(wrapper.find('[data-testid="ai-provider-error"]').exists()).toBe(true);
    registry.list.mockRejectedValueOnce(new Error('registry unavailable'));
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-provider-list"]').exists()).toBe(true);
  });
  it('saves an unconfigured named Mastra and keeps the selection after recheck without credentials', async () => {
    const { wrapper, registry, client, epoch } = await setup();
    await openIdentity(wrapper);
    await wrapper.get('[data-testid="ai-instance-name"]').setValue('Mastra Work');
    await wrapper.get('[data-testid="ai-instance-slug"]').setValue('mastra-work');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    expect(
      wrapper.find('[data-testid="ai-agent-wizard"] [data-testid="ai-api-key"]').exists(),
    ).toBe(false);
    await wrapper.get('[data-testid="ai-agent-instance-save"]').trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'create',
      instance: expect.objectContaining({
        driver: 'mastra',
        instanceId: 'mastra-work',
        name: 'Mastra Work',
      }),
    });
    expect(
      wrapper
        .get('[data-testid="ai-provider-select-agent:mastra-work"]')
        .attributes('aria-current'),
    ).toBe('true');
    expect(wrapper.get('[data-testid="ai-mastra-agent-id"]').element).toHaveProperty(
      'value',
      'mastra-work',
    );
    expect(client.probeProviderConnection).not.toHaveBeenCalled();
    expect(epoch.value).toBeGreaterThan(0);
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-provider-select-agent:mastra-work"]').exists()).toBe(true);
  });
  it('rejects duplicate IDs, keeps identity/config drafts when going back and uses one footer', async () => {
    const { wrapper, registry } = await setup({ native: true });
    await openIdentity(wrapper, 'codex');
    await wrapper.get('[data-testid="ai-instance-slug"]').setValue('codex');
    expect(
      wrapper.get('[data-testid="ai-instance-continue"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('[data-testid="ai-instance-slug"]').setValue('codex-work');
    await wrapper.get('[data-testid="ai-instance-name"]').setValue('Codex Work');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    await wrapper.get('[data-testid="ai-instance-home"]').setValue('/work/account');
    await wrapper
      .get('[data-testid="ai-agent-wizard"]')
      .findAll('button')
      .find((button) => button.text() === 'Back')!
      .trigger('click');
    expect(wrapper.get('[data-testid="ai-instance-name"]').element).toHaveProperty(
      'value',
      'Codex Work',
    );
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-instance-home"]').element).toHaveProperty(
      'value',
      '/work/account',
    );
    await wrapper.get('[data-testid="ai-agent-instance-save"]').trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'create',
      instance: expect.objectContaining({
        driver: 'codex',
        instanceId: 'codex-work',
        nativeConfig: expect.objectContaining({ homePath: '/work/account', writeScopes: [] }),
      }),
    });
    expect(wrapper.find('[data-testid="ai-provider-select-agent:codex"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(7);
  });
  it('keeps each field label associated with its own wizard input, never the background form', async () => {
    const { wrapper } = await setup({ native: true });
    await openIdentity(wrapper, 'codex');
    const wizard = wrapper.get('[data-testid="ai-agent-wizard"]');
    const ids = wizard.findAll('input[id]').map((input) => input.attributes('id'));
    for (const id of ids) expect(wrapper.findAll(`input[id="${id}"]`)).toHaveLength(1);
    for (const label of wizard.findAll('label[for]'))
      expect(wizard.find(`input[id="${label.attributes('for')}"]`).exists()).toBe(true);
  });
  it('lets the implicit Mastra default be disabled and re-enabled with Revision 0 materialization', async () => {
    const { wrapper, registry, epoch } = await setup();
    await wrapper.get('[data-testid="ai-provider-toggle-mastra"]').trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'update',
      instanceId: 'mastra',
      expectedRevision: 0,
      patch: { enabled: false },
    });
    expect(wrapper.get('[data-testid="ai-provider-toggle-mastra"]').attributes('data-state')).toBe(
      'unchecked',
    );
    await wrapper.get('[data-testid="ai-provider-toggle-mastra"]').trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenLastCalledWith({
      action: 'update',
      instanceId: 'mastra',
      expectedRevision: 1,
      patch: { enabled: true },
    });
    expect(epoch.value).toBe(2);
  });
  it('shows all native defaults, probes without saving, and persists their toggles through the registry', async () => {
    const { wrapper, registry, localClient } = await setup({ native: true });
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(6);
    expect(localClient.probeDefaultDriver).toHaveBeenCalledTimes(5);
    expect(registry.execute).not.toHaveBeenCalled();
    for (const id of ['mastra', 'codex', 'claude', 'pi', 'dsh', 'antigravity'])
      expect(wrapper.find(`[data-testid="ai-provider-toggle-${id}"]`).exists()).toBe(true);
    await wrapper.get('[data-testid="ai-provider-toggle-codex"]').trigger('click');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'update',
      instanceId: 'codex',
      expectedRevision: 0,
      patch: { enabled: false },
    });
    expect(localClient.saveConnection).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="ai-provider-select-agent:codex"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-provider-toggle-codex"]').attributes('data-state')).toBe(
      'unchecked',
    );
  });
  it('clears native probe metadata while reloading a Registry for another Desktop profile', async () => {
    const { wrapper, registry, localClient } = await setup({ native: true });
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'ready',
      models: [{ id: 'codex-model', name: 'Codex model' }],
      version: '9.9.9',
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-provider-select-agent:codex"]').text()).toContain('9.9.9');
    const previous = await registry.list();
    let resolveRegistry!: (value: typeof previous) => void;
    registry.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRegistry = resolve;
        }),
    );
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'not_installed',
      message: 'Not installed for new profile',
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    expect(wrapper.findAll('[data-testid="ai-provider-list-runtime-version"]')).toHaveLength(0);
    expect(wrapper.html()).not.toContain('9.9.9');
    resolveRegistry(previous);
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-provider-select-agent:codex"]').text()).toContain(
      'Not installed for new profile',
    );
    expect(wrapper.findAll('[data-testid="ai-provider-list-runtime-version"]')).toHaveLength(0);
  });

  it('shows only native-reported model capabilities and preserves exact model IDs', async () => {
    const { wrapper, localClient } = await setup({ native: true });
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'ready',
      models: [
        {
          id: 'native-precision-v1',
          name: 'Precision',
          reasoningEfforts: ['low', 'high'],
          defaultReasoningEffort: 'low',
          serviceTiers: [{ id: 'priority', name: 'Fast mode' }],
        },
        { id: 'other-native-model', name: 'Other' },
      ],
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-provider-select-agent:codex"]').trigger('click');
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="ai-native-model"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].get('[data-testid="ai-native-model-id"]').text()).toBe('native-precision-v1');
    expect(rows[0].get('[data-testid="ai-native-model-reasoning"]').attributes('title')).toBe(
      'low, high',
    );
    expect(rows[0].get('[data-testid="ai-native-model-service-tier"]').attributes('title')).toBe(
      'Fast mode',
    );
    expect(rows[1].get('[data-testid="ai-native-model-id"]').text()).toBe('other-native-model');
    expect(rows[1].find('[data-testid="ai-native-model-reasoning"]').exists()).toBe(false);
    expect(rows[1].find('[data-testid="ai-native-model-service-tier"]').exists()).toBe(false);
  });

  it('stores a per-Agent model visibility preference while keeping the discovered catalog intact', async () => {
    const { wrapper, localClient } = await setup({ native: true });
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'ready',
      modelVisibilityContext: 'mvc1:' + 'a'.repeat(64),
      models: [
        { id: 'model-a', name: 'Model A' },
        { id: 'model-b', name: 'Model B' },
      ],
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-provider-select-agent:codex"]').trigger('click');
    await flushPromises();
    const toggle = wrapper.get('[data-testid="ai-native-model-visible:model-a"]');
    expect((toggle.element as HTMLInputElement).checked).toBe(true);
    await toggle.setValue(false);
    expect((toggle.element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.findAll('[data-testid="ai-native-model"]')).toHaveLength(2);
    expect(
      localStorage.getItem(
        'ai:native-model-hidden:v2:desktop-profile-a:codex:mvc1:' + 'a'.repeat(64),
      ),
    ).toBe('["model-a"]');
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'ready',
      models: [{ id: 'model-a', name: 'Model A' }],
      modelVisibilityContext: 'mvc1:' + 'b'.repeat(64),
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(
      (wrapper.get('[data-testid="ai-native-model-visible:model-a"]').element as HTMLInputElement)
        .checked,
    ).toBe(true);
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'ready',
      models: [{ id: 'model-a', name: 'Model A' }],
      modelVisibilityContext: 'mvc1:' + 'a'.repeat(64),
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(
      (wrapper.get('[data-testid="ai-native-model-visible:model-a"]').element as HTMLInputElement)
        .checked,
    ).toBe(false);
    await wrapper.get('[data-testid="ai-native-model-visible:model-a"]').setValue(true);
    expect(
      localStorage.getItem(
        'ai:native-model-hidden:v2:desktop-profile-a:codex:mvc1:' + 'a'.repeat(64),
      ),
    ).toBe('[]');
  });

  it('masks authenticated account identity until explicitly revealed', async () => {
    const { wrapper, localClient } = await setup({ native: true });
    localClient.probeDefaultDriver.mockResolvedValue({
      status: 'ready',
      models: [{ id: 'verified-model', name: 'Verified' }],
      account: { type: 'chatgpt', email: 'alice@fixture.invalid', planType: 'team' },
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-provider-select-agent:codex"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-native-auth-identity"]').text()).toBe(
      'a***@fixture.invalid',
    );
    expect(wrapper.get('[data-testid="ai-native-auth-plan"]').text()).toContain('ChatGPT Team');
    expect(wrapper.html()).not.toContain('alice@fixture.invalid');
    await wrapper.get('[data-testid="ai-native-auth-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-native-auth-identity"]').text()).toBe(
      'alice@fixture.invalid',
    );
  });

  it('rejects an empty native name, preserves write scopes and current native identity during save', async () => {
    const { wrapper, registry } = await setup({ native: true });
    await wrapper.get('[data-testid="ai-provider-select-agent:claude"]').trigger('click');
    await wrapper.get('[data-testid="ai-native-name"]').setValue('  ');
    expect(wrapper.get('[data-testid="ai-native-save"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="ai-native-name"]').setValue('My Claude');
    await wrapper.get('[data-testid="ai-native-home"]').setValue('/account/work');
    await wrapper.get('[data-testid="ai-provider-detail"]').trigger('submit');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'update',
      instanceId: 'claude',
      expectedRevision: 0,
      patch: expect.objectContaining({
        name: 'My Claude',
        nativeConfig: expect.objectContaining({ writeScopes: [], homePath: '/account/work' }),
      }),
    });
  });
  it('retains unsaved form drafts when metadata did not change on recheck', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="ai-mastra-agent-name"]').setValue('My draft');
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-mastra-agent-name"]').element).toHaveProperty(
      'value',
      'My draft',
    );
  });
  it('shows revision failure without claiming success or changing selection', async () => {
    const { wrapper, registry } = await setup();
    registry.execute.mockRejectedValueOnce(new Error('CONFLICT'));
    await wrapper.get('[data-testid="ai-mastra-agent-name"]').setValue('Failed draft');
    await wrapper.get('[data-testid="ai-mastra-agent-name"]').trigger('blur');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-mastra-agent-name"]').element).toHaveProperty(
      'value',
      'Failed draft',
    );
    expect(wrapper.get('[data-testid="ai-provider-select-agent:mastra"]').text()).toContain(
      'Mastra',
    );
  });
  it('directly verifies Endpoint and Key without vendor selection or a second modal', async () => {
    const { wrapper, client, registry, epoch } = await setup();
    await configure(wrapper);
    expect(client.probeProviderConnection).toHaveBeenCalledWith({
      catalogId: 'custom',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-private-fixture',
    });
    expect(wrapper.get('[data-testid="ai-api-key"]').element).toHaveProperty('value', '');
    expect(wrapper.html()).not.toContain('sk-private-fixture');
    expect(wrapper.html()).not.toContain('single-use-onboarding-handle');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-mastra-connection-save"]').trigger('click');
    await flushPromises();
    expect(client.commitProviderOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingId: 'single-use-onboarding-handle',
        defaultModelId: 'model-1',
      }),
    );
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'bind',
      instanceId: 'mastra',
      expectedRevision: 0,
      connectionId: '22222222-2222-4222-8222-222222222222',
      modelId: 'model-1',
    });
    expect(epoch.value).toBeGreaterThan(0);
    expect(client.getProviderCatalog).not.toHaveBeenCalled();
  });
  it('uses the identity-bound replacement path and never reveals the saved key', async () => {
    const { wrapper, client } = await setup({ bound: true });
    expect(wrapper.html()).not.toContain('opaque-host-secret');
    expect(wrapper.get('[data-testid="ai-api-key"]').element).toHaveProperty('value', '');
    await configure(wrapper);
    expect(client.probeProviderReplacement).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ catalogId: 'custom', apiKey: 'sk-private-fixture' }),
    );
    expect(client.probeProviderConnection).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="ai-mastra-connection-save"]').trigger('click');
    await flushPromises();
    expect(client.commitProviderReplacement).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { onboardingId: 'single-use-onboarding-handle', defaultModelId: 'model-1' },
    );
    expect(client.commitProviderOnboarding).not.toHaveBeenCalled();
  });
  it('verifies and commits every subsequent credential rotation instead of reusing a stale committed handle', async () => {
    const { wrapper, client } = await setup({ bound: true });
    await configure(wrapper);
    await wrapper.get('[data-testid="ai-mastra-connection-save"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-api-key"]').setValue('sk-next-fixture');
    expect(
      wrapper.get('[data-testid="ai-mastra-connection-save"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('[data-testid="ai-connection-verify"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-mastra-connection-save"]').trigger('click');
    await flushPromises();
    expect(client.commitProviderReplacement).toHaveBeenCalledTimes(2);
    expect(wrapper.html()).not.toContain('sk-next-fixture');
    expect(client.commitProviderOnboarding).not.toHaveBeenCalled();
  });

  it('invalidates a verified handle after endpoint edits and never automatically performs a model test', async () => {
    const { wrapper, client } = await setup();
    await configure(wrapper);
    expect(
      wrapper.get('[data-testid="ai-mastra-connection-save"]').attributes('disabled'),
    ).toBeUndefined();
    await wrapper.get('[data-testid="ai-endpoint"]').setValue('https://other.example.com/v1');
    expect(
      wrapper.get('[data-testid="ai-mastra-connection-save"]').attributes('disabled'),
    ).toBeDefined();
    expect(client.testProviderOnboardingModel).not.toHaveBeenCalled();
  });
  it('requires an explicit warned test for a manually entered unadvertised model', async () => {
    const { wrapper, client } = await setup();
    client.probeProviderConnection.mockResolvedValueOnce(
      ok({
        ...probeResult(),
        models: [],
        credential: { status: 'requires_model_test' },
        discovery: { status: 'unsupported', source: 'manual' },
      }),
    );
    await configure(wrapper);
    await wrapper.get('[data-testid="ai-manual-model"]').setValue('manual-model');
    expect(wrapper.text()).toContain('may use provider credits');
    expect(client.testProviderOnboardingModel).not.toHaveBeenCalled();
    expect(
      wrapper.get('[data-testid="ai-mastra-connection-save"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('[data-testid="ai-manual-model-test"]').trigger('click');
    await flushPromises();
    expect(client.testProviderOnboardingModel).toHaveBeenCalledWith({
      onboardingId: 'single-use-onboarding-handle',
      modelId: 'manual-model',
    });
    expect(
      wrapper.get('[data-testid="ai-mastra-connection-save"]').attributes('disabled'),
    ).toBeUndefined();
  });
  it('can retry binding after a successful credential commit without creating duplicate model connections', async () => {
    const { wrapper, client, registry } = await setup();
    await configure(wrapper);
    registry.execute.mockRejectedValueOnce(new Error('CONFLICT'));
    await wrapper.get('[data-testid="ai-mastra-connection-save"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.get('[data-testid="ai-mastra-connection-save"]').trigger('click');
    await flushPromises();
    expect(client.commitProviderOnboarding).toHaveBeenCalledOnce();
    expect(registry.execute).toHaveBeenCalledTimes(2);
  });
  it('does not render a fake saved instance when the registry is unavailable', async () => {
    const { wrapper } = await setup({ noRegistry: true });
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(0);
    expect(wrapper.get('[data-testid="ai-provider-add"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[role="alert"]').text()).toContain('unavailable');
  });
  it('discards an in-flight probe when the selected Agent detail is destroyed', async () => {
    const { wrapper, client, registry } = await setup({ extra: true });
    let resolve!: (value: ReturnType<typeof ok<ProbeAIProviderConnectionRes>>) => void;
    client.probeProviderConnection.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await wrapper.get('[data-testid="ai-endpoint"]').setValue('https://api.example.com/v1');
    await wrapper.get('[data-testid="ai-api-key"]').setValue('sk-private-fixture');
    await wrapper.get('[data-testid="ai-connection-verify"]').trigger('click');
    await wrapper.get('[data-testid="ai-provider-select-agent:mastra-other"]').trigger('click');
    resolve(ok(probeResult()));
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-mastra-agent-id"]').element).toHaveProperty(
      'value',
      'mastra-other',
    );
    expect(wrapper.get('[data-testid="ai-api-key"]').element).toHaveProperty('value', '');
    expect(registry.execute).not.toHaveBeenCalled();
    expect(wrapper.findComponent(MastraAgentSettings).exists()).toBe(true);
  });
});

it('keeps an unverified native catalog readable but disables storing a contextless visibility preference', async () => {
  const { wrapper, localClient } = await setup({ native: true });
  localClient.probeDefaultDriver.mockResolvedValue({
    status: 'ready',
    models: [{ id: 'model-a', name: 'Model A' }],
  });
  await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
  await flushPromises();
  await wrapper.get('[data-testid="ai-provider-select-agent:codex"]').trigger('click');
  await flushPromises();
  expect(
    wrapper.get('[data-testid="ai-native-model-visible:model-a"]').attributes('disabled'),
  ).toBeDefined();
  expect(wrapper.get('[data-testid="ai-native-model-visibility-unavailable"]').text()).toContain(
    'native account context',
  );
  expect(localStorage.length).toBe(0);
});

it.each(['LOCAL_AGENT_RATE_LIMITED', 'LOCAL_AGENT_QUOTA_EXHAUSTED'] as const)(
  'shows the observed %s while preserving the native catalog and enabled intent',
  async (code) => {
    const { wrapper, localClient, registry } = await setup({ native: true });
    // Execution observations belong to a saved Connection, never the implicit default driver.
    await registry.execute({
      action: 'update',
      instanceId: 'codex',
      expectedRevision: 0,
      patch: { enabled: true },
    });
    localClient.probeConnection.mockResolvedValue({
      status: 'ready',
      models: [{ id: 'native-model', name: 'Native' }],
      modelVisibilityContext: 'mvc1:' + 'a'.repeat(64),
      lastExecutionFailure: { code, modelId: 'native-model', occurredAt: 1 },
    });
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-provider-select-agent:codex"]').trigger('click');
    await flushPromises();
    const row = wrapper.get('[data-testid="ai-provider-select-agent:codex"]');
    expect(localClient.probeConnection).toHaveBeenCalledWith('native-codex');
    expect(row.text()).toContain('Last request (native-model)');
    expect(row.text()).toContain(
      code === 'LOCAL_AGENT_RATE_LIMITED' ? 'rate limiting' : 'insufficient quota',
    );
    expect(row.get('.whitespace-nowrap').classes()).toContain('truncate');
    expect(wrapper.get('[data-testid="ai-provider-toggle-codex"]').attributes('data-state')).toBe(
      'checked',
    );
    expect(wrapper.findAll('[data-testid="ai-native-model"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="ai-provider-detail"]').text()).toContain(
      'Last request (native-model)',
    );
    expect(localClient.saveConnection).not.toHaveBeenCalled();
  },
);

it.each([
  'Safe startup diagnostic: native path redacted. ',
  '启动失败；本机路径与账号信息已隐藏。',
  'SafeUnbrokenDiagnostic',
])('shows the full safe 500-character status on focus and hover: %s', async (seed) => {
  const { wrapper, localClient } = await setup({ native: true, dom: true });
  const message = seed.repeat(Math.ceil(500 / seed.length)).slice(0, 500);
  const publicResult = {
    status: 'unavailable' as const,
    message,
    // Simulate ignored internal transport metadata, never part of the public message.
    stderr: 'PRIVATE_STDERR_FIXTURE',
    privatePath: 'C:\\Users\\PRIVATE_HOME_FIXTURE',
    token: 'PRIVATE_TOKEN_FIXTURE',
  };
  localClient.probeDefaultDriver.mockResolvedValue(publicResult);
  await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
  await flushPromises();
  const button = wrapper.get('[data-testid="ai-provider-select-agent:codex"]');
  const row = button.element.closest('[role="listitem"]')!;
  const inline = button.get('.whitespace-nowrap');
  expect(message).toHaveLength(500);
  expect(inline.text()).toBe(message);
  expect(inline.classes()).toContain('truncate');
  expect(row.classList.contains('h-20')).toBe(true); // Existing 20 × 4px = 80px layout token.
  expect(button.attributes('disabled')).toBeUndefined();

  (button.element as HTMLButtonElement).focus();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(message),
  );
  const description = document.getElementById(button.attributes('aria-describedby'))!;
  expect(description.getAttribute('role')).toBe('tooltip');
  expect(row.contains(description)).toBe(false); // Portal cannot change row height or be clipped by it.
  expect(button.attributes('aria-label')).toBe('codex');
  expect(inline.attributes('title')).toBeUndefined(); // Avoid a competing mouse-only browser tooltip.
  const popup = description.parentElement!;
  expect(popup.classList.contains('whitespace-pre-wrap')).toBe(true);
  expect(popup.classList.contains('break-words')).toBe(true);
  await button.trigger('keydown', { key: 'Escape' });
  await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull());
  expect(document.activeElement).toBe(button.element);
  (button.element as HTMLButtonElement).blur();
  button.element.dispatchEvent(
    new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }),
  );
  await vi.waitFor(() =>
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(message),
  );
  for (const marker of [
    'PRIVATE_STDERR_FIXTURE',
    'PRIVATE_HOME_FIXTURE',
    'PRIVATE_TOKEN_FIXTURE',
  ]) {
    expect(document.body.innerHTML).not.toContain(marker);
  }
  localClient.probeDefaultDriver.mockResolvedValue({ status: 'ready', models: [] });
  await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
  await flushPromises();
  expect(button.get('.whitespace-nowrap').text()).not.toBe(message);
  expect(document.body.textContent).not.toContain(message);
  expect(
    wrapper.findAll('[role="listitem"]').every((item) => item.classes().includes('h-20')),
  ).toBe(true);
});

it('keeps disabled row status focusable, selectable and its switch keyboard-operable', async () => {
  const { wrapper, registry } = await setup({ native: true, dom: true });
  await wrapper.get('[data-testid="ai-provider-toggle-codex"]').trigger('click');
  await flushPromises();
  const button = wrapper.get('[data-testid="ai-provider-select-agent:codex"]');
  expect(button.classes()).toContain('opacity-45');
  expect(button.attributes('disabled')).toBeUndefined();
  expect(button.classes()).not.toContain('pointer-events-none');
  (button.element as HTMLButtonElement).focus();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Inactive'),
  );
  await button.trigger('keydown', { key: 'Escape' });
  await button.trigger('click');
  await flushPromises();
  expect(button.attributes('aria-current')).toBe('true');
  expect(wrapper.find('[data-testid="ai-provider-detail"]').exists()).toBe(true);
  const toggle = wrapper.get('[data-testid="ai-provider-toggle-codex"]');
  expect(toggle.attributes('data-state')).toBe('unchecked');
  await toggle.trigger('keydown', { key: 'Enter' });
  await flushPromises();
  expect(registry.execute).toHaveBeenLastCalledWith({
    action: 'update',
    instanceId: 'codex',
    expectedRevision: 1,
    patch: { enabled: true },
  });
  expect(toggle.attributes('data-state')).toBe('checked');
});

// Source-side normalization is the privacy authority. The real IPC client parses
// the DTO but that schema only bounds/validates shape; it is not a text scrubber.
it.each([
  ['spawn', 'not_installed', 'The configured Agent executable could not be started.', undefined],
  [
    'stderr',
    'unavailable',
    'The local Agent is unavailable. Check its native configuration.',
    undefined,
  ],
  ['rpc', 'login_required', 'Sign in using the Agent’s native login command, then refresh.', 401],
  ['rpc', 'unavailable', 'The local Agent is unavailable. Check its native configuration.', 503],
  [
    'rpc',
    'unavailable',
    'The local Agent returned an unsupported or invalid protocol message.',
    -32603,
  ],
] as const)(
  'keeps %s/%s probe diagnostics private through Runtime, DTO, Tooltip and detail',
  async (kind, status, message, code) => {
    const directory = await mkdtemp(join(tmpdir(), 'memoflow-probe-privacy-'));
    vi.stubEnv('CODEX_HOME', directory);
    const flow = createNativeAgentFlowFixture(directory);
    const diagnostics =
      'PRIVATE_STDERR_FIXTURE C:\\Users\\PRIVATE_HOME_FIXTURE user@PRIVATE_ACCOUNT_FIXTURE.test api_key=PRIVATE_KEY_FIXTURE';
    const prefix = code === 401 ? '401 Unauthorized ' : 'Native startup or RPC failed ';
    flow.setProbeFailure({
      kind,
      ...(code === undefined ? {} : { code }),
      message: prefix + diagnostics,
    } as NativeProbeFailure);
    const logs = (['debug', 'info', 'log', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      const { wrapper, localClient } = await setup({ native: true, dom: true });
      localClient.probeDefaultDriver.mockImplementation(async (driver) =>
        driver === 'codex'
          ? flow.local.probeDefaultDriver(driver)
          : { status: 'not_installed', message: 'Other fixture Agent not installed' },
      );
      await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
      await vi.waitFor(() => expect(localClient.probeDefaultDriver).toHaveBeenCalledWith('codex'));
      const result = await flow.local.probeDefaultDriver('codex');
      expect(LocalAgentStatusSchema.parse(result)).toEqual({ status, message });
      await vi.waitFor(() =>
        expect(wrapper.get('[data-testid="ai-provider-select-agent:codex"]').text()).toContain(
          message,
        ),
      );
      const button = wrapper.get('[data-testid="ai-provider-select-agent:codex"]');
      await button.trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-testid="ai-provider-detail"]').text()).toContain(message);
      (button.element as HTMLButtonElement).focus();
      await vi.waitFor(() =>
        expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(message),
      );
      for (const marker of [
        'PRIVATE_STDERR_FIXTURE',
        'PRIVATE_HOME_FIXTURE',
        'PRIVATE_ACCOUNT_FIXTURE',
        'PRIVATE_KEY_FIXTURE',
      ]) {
        expect(JSON.stringify(result)).not.toContain(marker);
        expect(document.body.innerHTML).not.toContain(marker);
        expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toContain(marker);
      }
      expect(flow.requests.some(([method]) => method === 'turn/start')).toBe(false);
    } finally {
      wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
      await flow.close();
      logs.forEach((log) => log.mockRestore());
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('uses the renderer fallback when a rejected probe carries a private exception', async () => {
  const { wrapper, localClient } = await setup({ native: true, dom: true });
  localClient.probeDefaultDriver.mockRejectedValue(
    new Error(
      'PRIVATE_STDERR_FIXTURE C:\\Users\\PRIVATE_HOME_FIXTURE PRIVATE_ACCOUNT_FIXTURE@example.test api_key=PRIVATE_KEY_FIXTURE',
    ),
  );
  await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
  await flushPromises();
  const message = 'The local Agent operation failed. Check the connection and retry.';
  const button = wrapper.get('[data-testid="ai-provider-select-agent:codex"]');
  expect(button.text()).toContain(message);
  await button.trigger('click');
  await flushPromises();
  expect(wrapper.get('[data-testid="ai-provider-detail"]').text()).toContain(message);
  (button.element as HTMLButtonElement).focus();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(message),
  );
  expect(document.body.innerHTML).not.toContain('PRIVATE_');
});

it('configures AGY as an official native ACP Agent rather than a model API service', async () => {
  const { wrapper, registry, client } = await setup({ native: true });
  await openIdentity(wrapper, 'antigravity');
  await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
  await flushPromises();
  expect(wrapper.get('[data-testid="ai-instance-executable"]').element).toHaveProperty(
    'value',
    'agy_acp_server',
  );
  expect(wrapper.text()).toContain('official Antigravity ACP');
  await wrapper.get('[data-testid="ai-instance-home"]').setValue('/native/agy-profile');
  await wrapper.get('[data-testid="ai-agent-instance-save"]').trigger('click');
  await flushPromises();
  expect(registry.execute).toHaveBeenCalledWith({
    action: 'create',
    instance: expect.objectContaining({
      driver: 'antigravity',
      nativeConfig: expect.objectContaining({
        executablePath: 'agy_acp_server',
        homePath: '/native/agy-profile',
        writeScopes: [],
      }),
    }),
  });
  expect(client.probeProviderConnection).not.toHaveBeenCalled();
});

it('starts and cancels an explicit Google sign-in from the AGY provider', async () => {
  const { wrapper, localClient, bridge } = await setup({
    native: true,
    configured: ['antigravity'],
    dom: true,
  });
  localClient.probeConnection.mockResolvedValue({
    status: 'login_required',
    message: 'Sign in using the Agent’s native login command, then refresh.',
  });
  await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
  await flushPromises();
  await flushPromises();
  const provider = wrapper.get('[data-testid="ai-provider-select-agent:antigravity"]');
  expect(provider.text()).toContain('Not signed in to Google. Sign in to continue.');
  expect(provider.text()).not.toContain('native login command');
  await provider.trigger('click');
  await flushPromises();
  expect(wrapper.text()).not.toContain('Sign in using the Agent');
  expect(bridge.invoke).not.toHaveBeenCalled();

  const authorizationUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture&redirect_uri=http%3A%2F%2F127.0.0.1%3A43179%2F&response_type=code&state=state-1';
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  await wrapper.get('[data-testid="ai-agy-login"]').trigger('click');
  await flushPromises();
  expect(localClient.startLogin).toHaveBeenCalledWith('native-antigravity');
  expect(bridge.invoke).toHaveBeenCalledWith('system:openExternalUrl', { url: authorizationUrl });
  expect(wrapper.get('[data-testid="ai-agy-login-status"]').text()).toContain(
    'Google sign-in is open in your browser',
  );
  await wrapper.get('[data-testid="ai-agy-login-copy"]').trigger('click');
  await flushPromises();
  expect(writeText).toHaveBeenCalledWith(authorizationUrl);
  expect(wrapper.get('[data-testid="ai-agy-login-copy"]').text()).toBe('Link copied');

  await wrapper.get('[data-testid="ai-agy-login-cancel"]').trigger('click');
  await flushPromises();
  expect(localClient.cancelLogin).toHaveBeenCalledWith('native-antigravity', 'flow-1');
  expect(wrapper.get('[data-testid="ai-agy-login-status"]').text()).toBe(
    'Google sign-in was cancelled.',
  );
});

it('offers sign-out only through the official ACP capability', async () => {
  const { wrapper, localClient, bridge } = await setup({
    native: true,
    configured: ['antigravity'],
  });
  localClient.probeConnection.mockResolvedValue({
    status: 'ready',
    models: [{ id: 'native-model', name: 'Native Model' }],
  });
  await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
  await flushPromises();
  await flushPromises();
  await wrapper.get('[data-testid="ai-provider-select-agent:antigravity"]').trigger('click');
  await flushPromises();
  expect(bridge.invoke).not.toHaveBeenCalled();
  await wrapper.get('[data-testid="ai-agy-sign-out"]').trigger('click');
  await flushPromises();
  expect(localClient.signOut).toHaveBeenCalledWith('native-antigravity');
});
