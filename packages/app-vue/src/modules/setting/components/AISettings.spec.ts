import { ref } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentInstanceSchema,
  AgentRegistryCommandSchema,
  AIProviderConfigClientDTOSchema,
  LocalAgentConnectionSchema,
  type AgentInstance,
  type AgentInstanceModelBinding,
  type AIProviderConfigClientDTO,
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
} from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import AISettings from './AISettings.vue';
import MastraAgentSettings from './MastraAgentSettings.vue';

const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
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
function instance(id: string, driver: 'mastra' | 'codex' | 'claude' | 'pi' | 'dsh' = 'mastra') {
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
  options: { native?: boolean; bound?: boolean; extra?: boolean; noRegistry?: boolean } = {},
) {
  let instances: AgentInstance[] = [instance('mastra')];
  if (options.native)
    instances.push(
      ...(['codex', 'claude', 'pi', 'dsh'] as const).map((driver) => instance(driver, driver)),
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
  };
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
    global: {
      stubs: { teleport: true, DialogContent: { template: '<div><slot /></div>' } },
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
      provide: {
        [AI_CLIENT_KEY as symbol]: client,
        [AI_CONFIGURATION_REVISION_KEY as symbol]: epoch,
        ...(options.native ? { [AI_LOCAL_AGENT_KEY as symbol]: localClient } : {}),
        ...(!options.noRegistry ? { [AI_AGENT_REGISTRY_KEY as symbol]: registry } : {}),
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return { wrapper, client, registry, localClient, epoch };
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
  it('shows a real default Mastra with both row and detail enable switches and no vendor catalogue', async () => {
    const { wrapper, client, localClient } = await setup();
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="ai-provider-toggle-mastra"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-provider-detail-toggle"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-endpoint"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-api-key"]').attributes('type')).toBe('password');
    expect(client.getProviderCatalog).not.toHaveBeenCalled();
    expect(localClient.listConnections).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toMatch(/OpenRouter|DeepSeek|Gemini/);
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
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(6);
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
    expect(wrapper.get('[data-testid="ai-provider-detail-toggle"]').attributes('data-state')).toBe(
      'unchecked',
    );
    await wrapper.get('[data-testid="ai-provider-detail-toggle"]').trigger('click');
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
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(5);
    expect(localClient.probeDefaultDriver).toHaveBeenCalledTimes(4);
    expect(registry.execute).not.toHaveBeenCalled();
    for (const id of ['mastra', 'codex', 'claude', 'pi', 'dsh'])
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
    expect(wrapper.get('[data-testid="ai-provider-detail-toggle"]').attributes('data-state')).toBe(
      'unchecked',
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
