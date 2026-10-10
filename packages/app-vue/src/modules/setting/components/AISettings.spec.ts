import { h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import {
  AIProviderConfigClientDTOSchema,
  LocalAgentConnectionSchema,
  type LocalAgentConnectionInput,
  type LocalAgentStatus,
  type AIProviderConfigClientDTO,
} from '@memoflow/contracts/ai';
import { ok, fail, type Result } from '@memoflow/contracts/result';
import { AI_LOCAL_AGENT_KEY, AI_CLIENT_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import AISettings from './AISettings.vue';
import AIFooterComposer from '../../ai/components/AIFooterComposer.vue';
import AILocalRuntimePicker from '../../ai/components/AILocalRuntimePicker.vue';

vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function provider(id: string, name: string, isDefault = false) {
  return AIProviderConfigClientDTOSchema.parse({
    id,
    identityId: '33333333-3333-4333-8333-333333333333',
    name,
    providerDefinitionId: 'openai',
    baseUrl: 'https://api.example.com/v1',
    credentialRef: 'opaque-secret-handle',
    defaultModel: 'model-1',
    isActive: true,
    isDefault,
    priority: 1,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  });
}

async function setup(withNative = false, empty = false) {
  let records = [
    provider('11111111-1111-4111-8111-111111111111', 'First', true),
    provider('22222222-2222-4222-8222-222222222222', 'Second'),
  ];
  if (empty) records = [];
  const client = {
    listProviders: vi.fn(async () => ok(records)),
    getProviderCatalog: vi.fn(async () =>
      ok([
        {
          id: 'openai',
          name: 'OpenAI',
          description: 'Model service',
          defaultBaseUrl: 'https://api.openai.com/v1',
          baseUrlEditable: false,
          recommendedModelIds: [],
        },
      ]),
    ),
    updateProvider: vi.fn(
      async (
        id: string,
        patch: { name?: string; isActive?: boolean },
      ): Promise<Result<AIProviderConfigClientDTO>> => {
        records = records.map((record) =>
          String(record.id) === id ? { ...record, ...patch, version: record.version + 1 } : record,
        );
        return ok(records.find((record) => String(record.id) === id)!);
      },
    ),
    refreshProviderModels: vi.fn(async (id: string) =>
      ok({
        providerId: id,
        models: [{ id: 'model-1', name: 'Model One' }],
        fetchedAt: 1,
      }),
    ),
    testProvider: vi.fn(async () => ok({ ok: true })),
  };
  let nativeRecords = ['codex', 'claude', 'pi', 'dsh'].map((driver) =>
    LocalAgentConnectionSchema.parse({
      id: driver,
      driver,
      name: driver,
      executablePath: driver,
      enabled: true,
      writeScopes: [],
      revision: 7,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  if (empty) nativeRecords = [];
  const localClient = {
    listConnections: vi.fn(async () => nativeRecords),
    saveConnection: vi.fn(
      async (input: LocalAgentConnectionInput, id?: string, revision?: number) => {
        const old = nativeRecords.find((item) => item.id === id);
        if (old && old.revision !== revision) throw new Error('Conflict');
        const saved = LocalAgentConnectionSchema.parse({
          ...input,
          id: id ?? 'new-native',
          revision: (old?.revision ?? 0) + 1,
          createdAt: 1,
          updatedAt: 2,
        });
        nativeRecords = old
          ? nativeRecords.map((item) => (item.id === id ? saved : item))
          : [...nativeRecords, saved];
        return saved;
      },
    ),
    deleteConnection: vi.fn(async (id: string) => {
      nativeRecords = nativeRecords.filter((item) => item.id !== id);
    }),
    probeConnection: vi.fn(async (): Promise<LocalAgentStatus> => ({
      status: 'ready' as const,
      version: '1.0',
      models: [{ id: 'native-model', name: 'Native Model' }],
    })),
  };
  const wrapper = mount(AISettings, {
    global: {
      stubs: { teleport: true, DialogContent: { template: '<div><slot /></div>' } },
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
      provide: {
        [AI_CLIENT_KEY as symbol]: client,
        ...(withNative ? { [AI_LOCAL_AGENT_KEY as symbol]: localClient } : {}),
      },
    },
  });
  await flushPromises();
  return { wrapper, client, localClient };
}

describe('Providers settings interactions', () => {
  it('keeps an unsaved name draft when a recheck reloads unchanged metadata', async () => {
    const { wrapper } = await setup();
    await wrapper.get('#ai-saved-provider-name').setValue('Draft');
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect((wrapper.get('#ai-saved-provider-name').element as HTMLInputElement).value).toBe(
      'Draft',
    );
    wrapper.unmount();
  });

  it('discards a model refresh that arrives after the provider configuration changes', async () => {
    const { wrapper, client } = await setup();
    let finish!: (value: Awaited<ReturnType<typeof client.refreshProviderModels>>) => void;
    client.refreshProviderModels.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await wrapper.get('[data-testid="ai-saved-provider-models"] button').trigger('click');
    await wrapper.get('[role="switch"][aria-label="Enable First"]').trigger('click');
    await flushPromises();
    finish(
      ok({
        providerId: '11111111-1111-4111-8111-111111111111',
        models: [{ id: 'late-model', name: 'Late Model' }],
        fetchedAt: 1,
      }),
    );
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-saved-provider-models"]').text()).not.toContain(
      'Late Model',
    );
    wrapper.unmount();
  });

  it('selects the actual provider, saves its name and keeps the same selection after reload', async () => {
    const { wrapper, client } = await setup();
    await wrapper
      .get('[data-testid="ai-provider-select-22222222-2222-4222-8222-222222222222"]')
      .trigger('click');
    await wrapper.get('#ai-saved-provider-name').setValue('Renamed');
    await wrapper.get('[data-testid="ai-provider-save-metadata"]').trigger('click');
    await flushPromises();
    expect(client.updateProvider).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', {
      name: 'Renamed',
    });
    expect(wrapper.get('[data-testid="ai-provider-detail"]').text()).toContain('Renamed');
    expect(
      wrapper
        .get('[data-testid="ai-provider-select-22222222-2222-4222-8222-222222222222"]')
        .attributes('aria-current'),
    ).toBe('true');
    wrapper.unmount();
  });

  it('persists enabled state through the owner rather than changing a display-only switch', async () => {
    const { wrapper, client } = await setup();
    const row = wrapper.get(
      '[data-testid="ai-provider-select-22222222-2222-4222-8222-222222222222"]',
    ).element.parentElement!;
    await wrapper.get(`[role="switch"][aria-label="Enable Second"]`).trigger('click');
    await flushPromises();
    expect(client.updateProvider).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', {
      isActive: false,
    });
    expect(row.textContent).toContain('Inactive');
    wrapper.unmount();
  });

  it('rechecks catalog reads without paid connection tests or exposing credential handles', async () => {
    const { wrapper, client } = await setup();
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(client.refreshProviderModels.mock.calls.map(([id]) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(client.testProvider).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="ai-saved-provider-models"]').text()).toContain('Model One');
    expect(wrapper.text()).not.toContain('opaque-secret-handle');
    expect(wrapper.find('input[placeholder="Search providers…"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the draft when save fails and never reports a failed update as persisted', async () => {
    const { wrapper, client } = await setup();
    client.updateProvider.mockResolvedValueOnce(
      fail({ code: 'CONFLICT', message: 'Changed elsewhere' }),
    );
    await wrapper.get('#ai-saved-provider-name').setValue('Draft');
    await wrapper.get('[data-testid="ai-provider-save-metadata"]').trigger('click');
    await flushPromises();
    expect((wrapper.get('#ai-saved-provider-name').element as HTMLInputElement).value).toBe(
      'Draft',
    );
    expect(
      wrapper.get('[data-testid="ai-provider-select-11111111-1111-4111-8111-111111111111"]').text(),
    ).toContain('First');
    wrapper.unmount();
  });
});

describe('Unified native Providers', () => {
  it('rejects a whitespace-only native name before invoking the owner', async () => {
    const { wrapper, localClient } = await setup(true);
    await wrapper.get('[data-testid="ai-provider-select-local:codex"]').trigger('click');
    await wrapper.get('#ai-native-name').setValue('   ');
    expect(wrapper.get('[data-testid="ai-native-save"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="ai-provider-detail"]').trigger('submit');
    expect(localClient.saveConnection).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows API connections and all four native drivers in one list with one detail', async () => {
    const { wrapper } = await setup(true);
    expect(wrapper.findAll('[data-testid="ai-provider-list"] [role="listitem"]')).toHaveLength(6);
    await wrapper.get('[data-testid="ai-provider-select-local:claude"]').trigger('click');
    expect(wrapper.findAll('[data-testid="ai-provider-detail"]')).toHaveLength(1);
    expect((wrapper.get('#ai-native-name').element as HTMLInputElement).value).toBe('claude');
    expect(wrapper.find('#ai-saved-provider-url').exists()).toBe(false);
    wrapper.unmount();
  });
  it('saves native configuration with its current revision and never calls API update', async () => {
    const { wrapper, localClient, client } = await setup(true);
    await wrapper.get('[data-testid="ai-provider-select-local:codex"]').trigger('click');
    await wrapper.get('#ai-native-name').setValue('Personal Codex');
    await wrapper.get('[data-testid="ai-provider-detail"]').trigger('submit');
    await flushPromises();
    expect(localClient.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Personal Codex', driver: 'codex', writeScopes: [] }),
      'codex',
      7,
    );
    expect(client.updateProvider).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="ai-provider-select-local:codex"]').text()).toContain(
      'Personal Codex',
    );
    wrapper.unmount();
  });
  it('keeps native draft and shows an error when a revision save fails', async () => {
    const { wrapper, localClient } = await setup(true);
    localClient.saveConnection.mockRejectedValueOnce(new Error('Conflict'));
    await wrapper.get('[data-testid="ai-provider-select-local:codex"]').trigger('click');
    await wrapper.get('#ai-native-name').setValue('Unsaved');
    await wrapper.get('[data-testid="ai-provider-detail"]').trigger('submit');
    await flushPromises();
    expect((wrapper.get('#ai-native-name').element as HTMLInputElement).value).toBe('Unsaved');
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('toggles a native provider through the native owner with no write-scope expansion', async () => {
    const { wrapper, localClient, client } = await setup(true);
    await wrapper.get('[role="switch"][aria-label="Enable codex"]').trigger('click');
    await flushPromises();
    expect(localClient.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, writeScopes: [] }),
      'codex',
      7,
    );
    expect(client.updateProvider).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('rechecks native login and catalog without sending any inference request', async () => {
    const { wrapper, localClient, client } = await setup(true);
    await wrapper.get('[data-testid="ai-provider-recheck"]').trigger('click');
    await flushPromises();
    expect(localClient.probeConnection).toHaveBeenCalledTimes(4);
    expect(client.testProvider).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="ai-provider-select-local:dsh"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-provider-detail"]').text()).toContain('Native Model');
    wrapper.unmount();
  });
  it('removes a native association and selects an existing provider', async () => {
    const { wrapper, localClient } = await setup(true);
    await wrapper.get('[data-testid="ai-provider-select-local:pi"]').trigger('click');
    const remove = wrapper
      .findAll('[data-testid="ai-provider-detail"] button')
      .find((button) => button.text() === 'Delete')!;
    await remove.trigger('click');
    await flushPromises();
    expect(localClient.deleteConnection).toHaveBeenCalledWith('pi');
    expect(wrapper.find('[data-testid="ai-provider-select-local:pi"]').exists()).toBe(false);
    expect(wrapper.find('#ai-saved-provider-name').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Provider creation and composer integration', () => {
  it('creates a native provider from the same add menu with no provider search', async () => {
    const { wrapper, localClient } = await setup(true);
    await wrapper.get('[data-testid="ai-provider-add"]').trigger('click');
    await flushPromises();
    expect(
      wrapper
        .findAll('[data-testid^="ai-provider-catalog-"]')
        .filter((item) =>
          ['codex', 'claude', 'pi', 'dsh'].some((driver) =>
            item.attributes('data-testid')?.endsWith(driver),
          ),
        ),
    ).toHaveLength(4);
    await wrapper.get('[data-testid="ai-provider-catalog-dsh"]').trigger('click');
    await wrapper.get('#ai-instance-name').setValue('DSH Personal');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    await wrapper
      .get('[data-testid="ai-agent-wizard"] [data-testid="ai-provider-detail"]')
      .trigger('submit');
    await flushPromises();
    expect(localClient.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'dsh',
        name: 'DSH Personal',
        enabled: true,
        writeScopes: [],
      }),
    );
    expect(wrapper.find('[data-testid="ai-provider-select-local:new-native"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('does not steal selection when a native save finishes after switching provider', async () => {
    const { wrapper, localClient } = await setup(true);
    const implementation = localClient.saveConnection.getMockImplementation()!;
    let release!: () => void;
    localClient.saveConnection.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return implementation(...args);
    });
    await wrapper.get('[data-testid="ai-provider-select-local:codex"]').trigger('click');
    await wrapper.get('#ai-native-name').setValue('Saved elsewhere');
    await wrapper.get('[data-testid="ai-provider-detail"]').trigger('submit');
    await wrapper.get('[data-testid="ai-provider-select-local:pi"]').trigger('click');
    release();
    await flushPromises();
    expect((wrapper.get('#ai-native-name').element as HTMLInputElement).value).toBe('pi');
    expect(
      wrapper.get('[data-testid="ai-provider-select-local:pi"]').attributes('aria-current'),
    ).toBe('true');
    wrapper.unmount();
  });
  it('places native provider and model selection inside the input bottom rail and keeps exact model IDs', async () => {
    const onSelect = vi.fn();
    const wrapper = mount(AIFooterComposer, {
      props: { modelValue: '', loading: false, canSend: false, modelGroups: [], localAgent: true },
      slots: {
        'provider-options': () =>
          h(AILocalRuntimePicker, {
            choice: { runtimeKind: 'local_agent', connectionId: 'codex', modelId: 'native-model' },
            connections: [
              LocalAgentConnectionSchema.parse({
                id: 'codex',
                driver: 'codex',
                name: 'Codex',
                executablePath: 'codex',
                enabled: true,
                writeScopes: [],
                revision: 1,
                createdAt: 1,
                updatedAt: 1,
              }),
            ],
            models: [
              { id: 'native-model', name: 'Native Model' },
              { id: 'opaque/model[1m]', name: 'Second Model' },
            ],
            status: { status: 'ready', models: [] },
            loading: false,
            disabled: false,
            onSelect,
          }),
      },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
        ],
      },
    });
    const rail = wrapper.get('[data-testid="ai-composer-options"]');
    expect(rail.get('[data-testid="ai-local-runtime-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-chat-empty-models"]').exists()).toBe(false);
    await rail.get('select[aria-label="Model"]').setValue('opaque/model[1m]');
    expect(onSelect).toHaveBeenCalledWith({
      runtimeKind: 'local_agent',
      connectionId: 'codex',
      modelId: 'opaque/model[1m]',
    });
    wrapper.unmount();
  });
});

describe('Agent defaults and wizard capabilities', () => {
  it('shows unconfigured Mastra on Web, with only Mastra in Agent selection', async () => {
    const { wrapper, client, localClient } = await setup(false, true);
    expect(wrapper.get('[data-testid="ai-provider-list"]').text()).toContain('Mastra');
    expect(wrapper.get('[data-testid="ai-mastra-needs-config"]').text()).toContain(
      'Needs model configuration',
    );
    await wrapper.get('[data-testid="ai-provider-add"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="ai-provider-catalog-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="ai-provider-catalog-openai"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-provider-catalog-mastra"]').trigger('click');
    await wrapper.get('#ai-instance-name').setValue('Work Mastra');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-mastra-config"]').text()).toContain(
      'saved after credential verification',
    );
    await wrapper.get('[data-testid="ai-provider-catalog-openai"]').trigger('click');
    expect(wrapper.find('#ai-provider-api-key').exists()).toBe(true);
    expect(client.updateProvider).not.toHaveBeenCalled();
    expect(localClient.listConnections).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('synthesizes four Desktop slots, never probes on open, and materializes one slot without duplication', async () => {
    const { wrapper, localClient } = await setup(true, true);
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(5);
    expect(localClient.probeConnection).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="ai-provider-select-slot:codex"]').trigger('click');
    expect(wrapper.get('#ai-native-id').attributes('readonly')).toBeDefined();
    await wrapper.get('[data-testid="ai-provider-detail"]').trigger('submit');
    await flushPromises();
    expect(localClient.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ instanceSlug: 'codex-default', driver: 'codex' }),
      undefined,
      undefined,
    );
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(5);
    expect(wrapper.find('[data-testid="ai-provider-select-slot:codex"]').exists()).toBe(false);
    expect(
      wrapper.get('[data-testid="ai-provider-select-local:new-native"]').attributes('aria-current'),
    ).toBe('true');
    expect(localClient.probeConnection).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('keeps the built-in Codex slot when a second named Codex instance is created', async () => {
    const { wrapper, localClient } = await setup(true, true);
    await wrapper.get('[data-testid="ai-provider-add"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-provider-catalog-codex"]').trigger('click');
    await wrapper.get('#ai-instance-name').setValue('Codex Work');
    await wrapper.get('#ai-instance-slug').setValue('codex-work');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    await wrapper
      .get('[data-testid="ai-agent-wizard"] [data-testid="ai-provider-detail"]')
      .trigger('submit');
    await flushPromises();
    expect(localClient.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ driver: 'codex', instanceSlug: 'codex-work' }),
    );
    expect(wrapper.find('[data-testid="ai-provider-select-slot:codex"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-provider-select-local:new-native"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="ai-provider-list"] [role="listitem"]')).toHaveLength(6);
    wrapper.unmount();
  });
  it('blocks duplicate identity and preserves identity while navigating back from Config', async () => {
    const { wrapper, localClient } = await setup(true);
    await wrapper.get('[data-testid="ai-provider-add"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="ai-provider-catalog-codex"]').trigger('click');
    await wrapper.get('#ai-instance-slug').setValue('codex');
    expect(
      wrapper.get('[data-testid="ai-instance-continue"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('#ai-instance-slug').setValue('codex-work');
    await wrapper.get('#ai-instance-name').setValue('Work');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    await wrapper.get('[data-testid="ai-agent-wizard"] #ai-native-home').setValue('/work/home');
    await wrapper
      .get('[data-testid="ai-agent-wizard"]')
      .findAll('button')
      .find((item) => item.text() === 'Back')!
      .trigger('click');
    expect((wrapper.get('#ai-instance-slug').element as HTMLInputElement).value).toBe('codex-work');
    await wrapper.get('[data-testid="ai-instance-continue"]').trigger('click');
    expect(
      (wrapper.get('[data-testid="ai-agent-wizard"] #ai-native-home').element as HTMLInputElement)
        .value,
    ).toBe('/work/home');
    expect(localClient.saveConnection).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each(['not_installed', 'login_required', 'unavailable', 'ready'] as const)(
    'displays explicit native %s status',
    async (status) => {
      const { wrapper, localClient } = await setup(true);
      localClient.probeConnection.mockResolvedValueOnce(
        status === 'ready'
          ? { status, models: [{ id: 'model', name: 'Model' }], version: '1' }
          : { status, message: status },
      );
      await wrapper.get('[data-testid="ai-provider-select-local:codex"]').trigger('click');
      await wrapper
        .get('[data-testid="ai-provider-detail"]')
        .findAll('button')
        .find((item) => item.text().includes('Check'))!
        .trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-testid="ai-provider-detail"]').text()).toContain(
        status === 'ready' ? 'Model' : status,
      );
      wrapper.unmount();
    },
  );
});
