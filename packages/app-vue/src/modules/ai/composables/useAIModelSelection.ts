import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import type { AgentConversationSelection, AgentRegistrySnapshot } from '@memoflow/ai-contracts';
import type { ChatModelOption, PersistedConversationModelMap, ProviderListItem } from './types';
import { isModelSelectable, listSelectableModels, type ModelCatalog } from './useAIModelCatalog';

const LAST_MODEL_STORAGE_KEY = 'ai:last-model-key';
const CONVERSATION_MODEL_STORAGE_KEY = 'ai:conversation-model-map';
const MODEL_PREFERENCE_STORAGE_PREFIX = 'ai:model-preference:v1';

export interface UseAIModelSelectionOptions {
  providers: Ref<ProviderListItem[]>;
  /** When available, the Agent Registry is authoritative for new conversation choices. */
  agentRegistrySnapshot?: Ref<AgentRegistrySnapshot | null>;
  /** Ephemeral verified live directory, never persisted as provider configuration. */
  modelCatalog?: Ref<ModelCatalog>;
  /** Identity/Profile owner for persisted model preferences. */
  resolveIdentity?: () => string;
  /** Existing provider/native default, resolved by the owning runtime. */
  getDefaultModelKey?: () => string | undefined;
  chatConversationId: Ref<string>;
  readConversationSelection?: (
    conversationId: string,
  ) => Promise<AgentConversationSelection | null>;
}

export function useAIModelSelection(options: UseAIModelSelectionOptions) {
  const { t } = useI18n();
  const selectedModelKey = ref('');
  // Agent identity is selected independently, even when it has no configured model.
  const selectedAgentId = ref('');
  const authoritativeSelection = ref<AgentConversationSelection | null>(null);
  const selectionLoading = ref(false);
  let restorationGeneration = 0;
  let observedIdentity = '';
  onBeforeUnmount(() => {
    restorationGeneration++;
  });

  const legacyGroups = computed(() =>
    options.providers.value
      .map((provider) => {
        const fallbackModels =
          provider.defaultModel && !provider.availableModels?.length
            ? [{ id: provider.defaultModel, name: provider.defaultModel }]
            : [];
        const models = [...(provider.availableModels ?? []), ...fallbackModels];

        return {
          providerId: provider.id,
          providerName: provider.name || t('common.unknown'),
          models: models.map((model) => ({
            key: `${provider.id}::${model.id}`,
            providerId: provider.id,
            providerName: provider.name || t('common.unknown'),
            modelId: model.id,
            modelName: model.name || model.id,
          })),
        };
      })
      .filter((group) => group.models.length > 0),
  );

  /** New conversations only expose models explicitly bound to enabled Mastra agents. */
  const modelGroups = computed(() => {
    if (!options.agentRegistrySnapshot) return legacyGroups.value;
    const snapshot = options.agentRegistrySnapshot.value;
    if (!snapshot) return [];
    const providers = new Map(options.providers.value.map((provider) => [provider.id, provider]));
    const boundGroups = snapshot.instances
      .filter((instance) => instance.enabled)
      .flatMap((instance) =>
        (instance.driver === 'mastra'
          ? snapshot.bindings
              .filter((binding) => binding.instanceId === instance.instanceId)
              .map((binding) => ({
                connectionId: binding.connectionId,
                preferredModelId: binding.modelId,
              }))
          : [
              {
                connectionId: instance.legacyConnectionId ?? instance.instanceId,
                preferredModelId: undefined,
              },
            ]
        ).flatMap((binding) => {
          const provider = providers.get(binding.connectionId);
          if (instance.driver === 'mastra' && !provider) return [];
          const models = options.modelCatalog?.value[instance.instanceId]?.models ?? [];
          const orderedModels = [
            ...models.filter((model) => model.modelId === binding.preferredModelId),
            ...models.filter((model) => model.modelId !== binding.preferredModelId),
          ];
          const providerName =
            instance.driver === 'mastra'
              ? `${instance.name} · ${provider?.name || t('common.unknown')}`
              : instance.name;
          return [
            {
              providerId: `agent:${instance.instanceId}:${binding.connectionId}`,
              providerName,
              models: orderedModels
                .filter((model) => model.providerId === binding.connectionId)
                .map((model) => ({ ...model, providerName })),
            },
          ];
        }),
      );
    // Historical provider-only choice is exposed only for the exact existing
    // conversation map entry. Never offer global legacy defaults to new chats.
    const conversationId = options.chatConversationId.value;
    const legacyKey = conversationId ? readConversationModelStorage()[conversationId] : '';
    const legacyModel =
      legacyKey && !legacyKey.startsWith('agent:')
        ? legacyGroups.value
            .flatMap((group) => group.models)
            .find((model) => model.key === legacyKey)
        : undefined;
    return legacyModel
      ? [
          ...boundGroups,
          {
            providerId: `legacy:${legacyModel.providerId}`,
            providerName: `${legacyModel.providerName} · Legacy`,
            models: [legacyModel],
          },
        ]
      : boundGroups;
  });

  const allModelOptions = computed<ChatModelOption[]>(() =>
    modelGroups.value.flatMap((group) => group.models),
  );
  const selectedModel = computed<ChatModelOption | null>(
    () => allModelOptions.value.find((item) => item.key === selectedModelKey.value) || null,
  );
  const selectedAgentModels = computed(() =>
    selectedAgentId.value
      ? allModelOptions.value.filter((model) => model.agentInstanceId === selectedAgentId.value)
      : allModelOptions.value,
  );
  const canSendMessage = computed(
    () =>
      !selectionLoading.value &&
      selectedModel.value !== null &&
      (!selectedAgentId.value || selectedModel.value.agentInstanceId === selectedAgentId.value),
  );

  function identityScope(): string {
    return options.resolveIdentity?.() || '';
  }

  observedIdentity = identityScope();

  function scopedStorageKey(prefix: string, identity = identityScope()): string {
    return `${prefix}:${encodeURIComponent(identity || 'default')}`;
  }

  function readLastSelectedModelKey(identity = identityScope()): string {
    const scopedKey = `${MODEL_PREFERENCE_STORAGE_PREFIX}:${encodeURIComponent(identity || 'default')}`;
    if (scopedKey) {
      const scoped = localStorage.getItem(scopedKey);
      if (scoped) return scoped;
      // Adopt the pre-profile global preference once for the current identity.
      const legacy = localStorage.getItem(LAST_MODEL_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(scopedKey, legacy);
        localStorage.removeItem(LAST_MODEL_STORAGE_KEY);
        return legacy;
      }
      return '';
    }
    return '';
  }

  function writeLastSelectedModelKey(modelKey: string, identity = identityScope()) {
    const key = `${MODEL_PREFERENCE_STORAGE_PREFIX}:${encodeURIComponent(identity || 'default')}`;
    if (!modelKey) localStorage.removeItem(key);
    else localStorage.setItem(key, modelKey);
  }

  function readConversationModelStorage(): PersistedConversationModelMap {
    try {
      const key = scopedStorageKey(CONVERSATION_MODEL_STORAGE_KEY);
      const legacyKey = CONVERSATION_MODEL_STORAGE_KEY;
      if (!key) return {};
      const raw = localStorage.getItem(key);
      if (!raw) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (!legacyRaw) return {};
        const migrated = JSON.parse(legacyRaw) as unknown;
        if (!migrated || typeof migrated !== 'object' || Array.isArray(migrated)) return {};
        localStorage.setItem(key, JSON.stringify(migrated));
        localStorage.removeItem(legacyKey);
        return migrated as PersistedConversationModelMap;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const legacyRaw = localStorage.getItem(CONVERSATION_MODEL_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as unknown;
        if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
          const merged = {
            ...(legacy as PersistedConversationModelMap),
            ...(parsed as PersistedConversationModelMap),
          };
          localStorage.setItem(key, JSON.stringify(merged));
          localStorage.removeItem(CONVERSATION_MODEL_STORAGE_KEY);
          return merged;
        }
      }
      return parsed as PersistedConversationModelMap;
    } catch {
      return {};
    }
  }

  function writeConversationModelStorage(next: PersistedConversationModelMap) {
    const key = scopedStorageKey(CONVERSATION_MODEL_STORAGE_KEY);
    if (key) localStorage.setItem(key, JSON.stringify(next));
  }

  function persistSelectedModel(
    modelKey: string,
    conversationId?: string,
    identity = identityScope(),
  ) {
    if (identity !== identityScope()) return;
    writeLastSelectedModelKey(modelKey, identity);
    if (!conversationId) return;
    const stored = readConversationModelStorage();
    if (!modelKey) {
      delete stored[conversationId];
    } else {
      stored[conversationId] = modelKey;
    }
    writeConversationModelStorage(stored);
  }

  function clearConversationModelSelection(conversationId: string) {
    if (!conversationId) return;
    const stored = readConversationModelStorage();
    if (!(conversationId in stored)) return;
    delete stored[conversationId];
    writeConversationModelStorage(stored);
  }

  function getPersistedModelKey(conversationId?: string): string {
    if (conversationId) {
      const conversationModelKey = readConversationModelStorage()[conversationId];
      if (conversationModelKey) return conversationModelKey;
    }
    return readLastSelectedModelKey();
  }

  function syncSelectedModel(preferredModelKey?: string) {
    // Restore/fallback only after the enabled Mastra directories have settled.
    // A configured binding is not discovered inventory and must not overwrite
    // an explicit model preference while another connection is still loading.
    const snapshot = options.agentRegistrySnapshot?.value;
    const catalogs = options.modelCatalog?.value;
    if (
      catalogs &&
      snapshot?.bindings.some(
        (binding) =>
          snapshot.instances.some(
            (instance) =>
              instance.instanceId === binding.instanceId &&
              instance.enabled &&
              instance.driver === 'mastra',
          ) && catalogs[binding.instanceId] === undefined,
      )
    )
      return;
    // Disabling hides eligibility, not the user's explicit preference. Keep the
    // pending tuple so re-enabling can restore it without choosing another Agent.
    const selectedInstance = options.agentRegistrySnapshot?.value?.instances.find(
      (instance) => instance.instanceId === selectedAgentId.value,
    );
    if (selectedInstance && !selectedInstance.enabled) return;
    // Directory eligibility can disappear during browsing, but a refresh is not
    // a new selection command. Preserve the current tuple; selectedModel/canSend
    // derive whether that tuple is currently executable from the live catalog.
    if (
      selectedModelKey.value &&
      (!preferredModelKey || preferredModelKey === selectedModelKey.value)
    )
      return;
    if (!allModelOptions.value.length) {
      selectedModelKey.value = '';
      return;
    }

    const conversationId = options.chatConversationId.value;
    if (options.agentRegistrySnapshot && conversationId) {
      const saved = readConversationModelStorage()[conversationId];
      const binding = authoritativeSelection.value;
      if (binding && saved && !saved.startsWith('agent:')) {
        selectedModelKey.value = '';
        return;
      }
      if (!saved || !allModelOptions.value.some((item) => item.key === saved)) {
        selectedModelKey.value = '';
        return;
      }
    }
    const defaultProvider =
      options.providers.value.find((item) => item.isDefault) || options.providers.value[0];
    const configuredDefault = defaultProvider?.defaultModel
      ? allModelOptions.value.find(
          (item) =>
            item.providerId === defaultProvider.id && item.modelId === defaultProvider.defaultModel,
        )?.key
      : undefined;
    const explicitDefault = options.getDefaultModelKey?.();
    const newThread = !options.chatConversationId.value;
    const preferredCandidates = (
      newThread
        ? [explicitDefault, preferredModelKey, configuredDefault, selectedModelKey.value]
        : [preferredModelKey, selectedModelKey.value, explicitDefault, configuredDefault]
    ).filter((item): item is string => Boolean(item));

    const selectableModels = options.modelCatalog
      ? listSelectableModels(options.modelCatalog.value, selectedAgentId.value || undefined)
      : allModelOptions.value;
    for (const candidate of preferredCandidates) {
      const option = allModelOptions.value.find(
        (item) =>
          item.key === candidate &&
          (!options.agentRegistrySnapshot ||
            item.agentInstanceId !== undefined ||
            (Boolean(options.chatConversationId.value) &&
              readConversationModelStorage()[options.chatConversationId.value] === candidate)) &&
          (!selectedAgentId.value || item.agentInstanceId === selectedAgentId.value) &&
          (!options.modelCatalog ||
            !item.agentInstanceId ||
            isModelSelectable(options.modelCatalog.value, item.agentInstanceId, item.modelId)),
      );
      if (option) {
        selectedAgentId.value = option.agentInstanceId ?? '';
        selectedModelKey.value = candidate;
        persistSelectedModel(candidate, options.chatConversationId.value || undefined);
        return;
      }
    }

    const configuredOption = preferredCandidates
      .map((candidate) => selectableModels.find((model) => model.key === candidate))
      .find((model) => model !== undefined);
    const defaultOption = configuredOption ?? selectableModels[0];

    selectedModelKey.value = defaultOption?.key || '';
    if (defaultOption?.agentInstanceId) selectedAgentId.value = defaultOption.agentInstanceId;
    persistSelectedModel(selectedModelKey.value, options.chatConversationId.value || undefined);
  }

  function selectModel(modelKey: string): 'selected' | 'unavailable' {
    if (selectionLoading.value) return 'unavailable';
    const next = allModelOptions.value.find((item) => item.key === modelKey);
    if (!next) return 'unavailable';
    const conversationId = options.chatConversationId.value;
    if (options.agentRegistrySnapshot && !next.agentInstanceId && !conversationId)
      return 'unavailable';
    selectedAgentId.value = next.agentInstanceId ?? '';
    selectedModelKey.value = modelKey;
    persistSelectedModel(modelKey, conversationId || undefined);
    return 'selected';
  }

  function selectAgent(instanceId: string): 'selected' | 'unavailable' {
    if (selectionLoading.value) return 'unavailable';
    const instance = options.agentRegistrySnapshot?.value?.instances.find(
      (entry) => entry.instanceId === instanceId && entry.driver === 'mastra' && entry.enabled,
    );
    if (!instance) return 'unavailable';
    selectedAgentId.value = instanceId;
    const models = allModelOptions.value.filter((model) => model.agentInstanceId === instanceId);
    const next = models.find((model) => model.key === selectedModelKey.value) ?? models[0];
    selectedModelKey.value = next?.key ?? '';
    persistSelectedModel(selectedModelKey.value, options.chatConversationId.value || undefined);
    return 'selected';
  }

  if (options.readConversationSelection) {
    watch(
      options.chatConversationId,
      async (conversationId) => {
        const generation = ++restorationGeneration;
        const identity = identityScope();
        authoritativeSelection.value = null;
        selectionLoading.value = Boolean(conversationId);
        if (!conversationId) return;
        selectedModelKey.value = '';
        try {
          const selection = await options.readConversationSelection!(conversationId);
          if (generation !== restorationGeneration || identity !== identityScope()) return;
          authoritativeSelection.value = selection;
          // Preserve a pending next-turn choice while its live catalogue loads.
          // A cached model is never enough without an enabled instance and owned binding.
          const saved = readConversationModelStorage()[conversationId];
          const [agentKey, providerId, modelId] = saved?.split('::') ?? [];
          const instanceId = agentKey?.startsWith('agent:') ? agentKey.slice(6) : undefined;
          const snapshot = options.agentRegistrySnapshot?.value;
          const catalog = instanceId ? options.modelCatalog?.value[instanceId] : undefined;
          const pending =
            instanceId &&
            providerId &&
            modelId &&
            snapshot?.instances.some(
              (instance) =>
                instance.instanceId === instanceId &&
                instance.driver === 'mastra' &&
                instance.enabled,
            ) &&
            snapshot.bindings.some(
              (binding) => binding.instanceId === instanceId && binding.connectionId === providerId,
            ) &&
            (catalog === undefined || catalog.models.some((model) => model.modelId === modelId));
          selectedAgentId.value = pending ? instanceId : (selection?.agentInstanceId ?? '');
          if (!pending && selection?.providerId && selection.modelId) {
            persistSelectedModel(
              `agent:${selection.agentInstanceId}::${selection.providerId}::${selection.modelId}`,
              conversationId,
              identity,
            );
          }
          syncSelectedModel(getPersistedModelKey(conversationId));
          selectionLoading.value = false;
        } catch {
          if (generation !== restorationGeneration) return;
          // Keep sends disabled when the server's conversation authority is unavailable.
          selectedModelKey.value = '';
        }
      },
      { immediate: true },
    );
  }

  if (options.resolveIdentity) {
    watch(
      options.resolveIdentity,
      (identity) => {
        if (identity === observedIdentity) return;
        observedIdentity = identity;
        restorationGeneration++;
        selectedModelKey.value = '';
        selectedAgentId.value = '';
        authoritativeSelection.value = null;
        syncSelectedModel(getPersistedModelKey(options.chatConversationId.value || undefined));
      },
      { flush: 'sync' },
    );
  }

  watch(
    [() => allModelOptions.value.map((item) => item.key).join('|'), options.chatConversationId],
    () => {
      if (identityScope() !== observedIdentity) return;
      syncSelectedModel(getPersistedModelKey(options.chatConversationId.value || undefined));
    },
    { immediate: true },
  );

  return {
    selectedModelKey,
    selectionLoading,
    selectedAgentId,
    selectedAgentModels,
    selectAgent,
    selectedModel,
    modelGroups,
    allModelOptions,
    canSendMessage,
    syncSelectedModel,
    selectModel,
    getPersistedModelKey,
    clearConversationModelSelection,
    persistSelectedModel,
  };
}
