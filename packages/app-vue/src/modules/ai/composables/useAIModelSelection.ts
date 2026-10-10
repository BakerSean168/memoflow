import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import type {
  AgentConversationSelection,
  AgentRegistrySnapshot,
  AIModelInfo,
} from '@memoflow/contracts/ai';
import type { ChatModelOption, PersistedConversationModelMap, ProviderListItem } from './types';

const LAST_MODEL_STORAGE_KEY = 'ai:last-model-key';
const CONVERSATION_MODEL_STORAGE_KEY = 'ai:conversation-model-map';

export interface UseAIModelSelectionOptions {
  providers: Ref<ProviderListItem[]>;
  /** When available, the Agent Registry is authoritative for new conversation choices. */
  agentRegistrySnapshot?: Ref<AgentRegistrySnapshot | null>;
  /** Ephemeral verified live directory, never persisted as provider configuration. */
  modelCatalogs?: Ref<Record<string, AIModelInfo[]>>;
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
      .filter((instance) => instance.driver === 'mastra' && instance.enabled)
      .flatMap((instance) =>
        snapshot.bindings
          .filter((binding) => binding.instanceId === instance.instanceId)
          .flatMap((binding) => {
            const provider = providers.get(binding.connectionId);
            if (!provider) return [];
            const inventory = options.modelCatalogs?.value[binding.connectionId] ?? [];
            const preferred = inventory.find((model) => model.id === binding.modelId);
            const models = [
              preferred ?? { id: binding.modelId, name: binding.modelId },
              ...inventory.filter((model) => model.id !== binding.modelId),
            ];
            const providerName = `${instance.name} · ${provider.name || t('common.unknown')}`;
            return [
              {
                providerId: `agent:${instance.instanceId}:${binding.connectionId}`,
                providerName,
                models: models.map((model) => ({
                  key: `agent:${instance.instanceId}::${binding.connectionId}::${model.id}`,
                  agentInstanceId: instance.instanceId,
                  providerId: provider.id,
                  providerName,
                  modelId: model.id,
                  modelName: model.name || model.id,
                })),
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

  function readLastSelectedModelKey(): string {
    return localStorage.getItem(LAST_MODEL_STORAGE_KEY) || '';
  }

  function writeLastSelectedModelKey(modelKey: string) {
    if (!modelKey) {
      localStorage.removeItem(LAST_MODEL_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LAST_MODEL_STORAGE_KEY, modelKey);
  }

  function readConversationModelStorage(): PersistedConversationModelMap {
    try {
      const raw = localStorage.getItem(CONVERSATION_MODEL_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as PersistedConversationModelMap) : {};
    } catch {
      return {};
    }
  }

  function writeConversationModelStorage(next: PersistedConversationModelMap) {
    localStorage.setItem(CONVERSATION_MODEL_STORAGE_KEY, JSON.stringify(next));
  }

  function persistSelectedModel(modelKey: string, conversationId?: string) {
    writeLastSelectedModelKey(modelKey);
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
    if (!allModelOptions.value.length) {
      selectedModelKey.value = '';
      return;
    }

    const conversationId = options.chatConversationId.value;
    if (options.agentRegistrySnapshot && conversationId) {
      const saved = readConversationModelStorage()[conversationId];
      const binding = authoritativeSelection.value;
      if (binding && !saved?.startsWith(`agent:${binding.agentInstanceId}::`)) {
        selectedModelKey.value = '';
        return;
      }
      if (!saved || !allModelOptions.value.some((item) => item.key === saved)) {
        selectedModelKey.value = '';
        return;
      }
    }
    const preferredCandidates = [preferredModelKey, selectedModelKey.value].filter(
      (item): item is string => Boolean(item),
    );

    for (const candidate of preferredCandidates) {
      const option = allModelOptions.value.find(
        (item) =>
          item.key === candidate &&
          (!selectedAgentId.value || item.agentInstanceId === selectedAgentId.value),
      );
      if (option) {
        selectedAgentId.value = option.agentInstanceId ?? '';
        selectedModelKey.value = candidate;
        persistSelectedModel(candidate, options.chatConversationId.value || undefined);
        return;
      }
    }

    const defaultProvider =
      options.providers.value.find((item) => item.isDefault) || options.providers.value[0] || null;

    const defaultOption =
      (defaultProvider?.defaultModel
        ? selectedAgentModels.value.find(
            (item) =>
              item.providerId === defaultProvider.id &&
              item.modelId === defaultProvider.defaultModel,
          )
        : null) ||
      selectedAgentModels.value.find((item) => item.providerId === defaultProvider?.id) ||
      selectedAgentModels.value[0];

    selectedModelKey.value = defaultOption?.key || '';
    if (defaultOption?.agentInstanceId) selectedAgentId.value = defaultOption.agentInstanceId;
    persistSelectedModel(selectedModelKey.value, options.chatConversationId.value || undefined);
  }

  function selectModel(modelKey: string): 'selected' | 'new_conversation_required' | 'unavailable' {
    if (selectionLoading.value) return 'unavailable';
    const next = allModelOptions.value.find((item) => item.key === modelKey);
    if (!next) return 'unavailable';
    const conversationId = options.chatConversationId.value;
    if (options.agentRegistrySnapshot && conversationId) {
      const saved = readConversationModelStorage()[conversationId];
      const savedAgent =
        authoritativeSelection.value?.agentInstanceId ??
        (saved?.startsWith('agent:') ? saved.split('::')[0].slice(6) : undefined);
      if (
        (!saved && !savedAgent) ||
        (savedAgent ? savedAgent !== next.agentInstanceId : saved !== next.key)
      )
        return 'new_conversation_required';
    }
    selectedAgentId.value = next.agentInstanceId ?? '';
    selectedModelKey.value = modelKey;
    persistSelectedModel(modelKey, conversationId || undefined);
    return 'selected';
  }

  function selectAgent(
    instanceId: string,
  ): 'selected' | 'new_conversation_required' | 'unavailable' {
    if (selectionLoading.value) return 'unavailable';
    const instance = options.agentRegistrySnapshot?.value?.instances.find(
      (entry) => entry.instanceId === instanceId && entry.driver === 'mastra' && entry.enabled,
    );
    if (!instance) return 'unavailable';
    const previous =
      authoritativeSelection.value?.agentInstanceId ?? selectedModel.value?.agentInstanceId;
    if (options.chatConversationId.value && previous !== instanceId)
      return 'new_conversation_required';
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
        authoritativeSelection.value = null;
        selectionLoading.value = Boolean(conversationId);
        if (!conversationId) return;
        selectedModelKey.value = '';
        try {
          const selection = await options.readConversationSelection!(conversationId);
          if (generation !== restorationGeneration) return;
          authoritativeSelection.value = selection;
          selectedAgentId.value = selection?.agentInstanceId ?? '';
          if (selection?.providerId && selection.modelId) {
            persistSelectedModel(
              `agent:${selection.agentInstanceId}::${selection.providerId}::${selection.modelId}`,
              conversationId,
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

  watch(
    [() => allModelOptions.value.map((item) => item.key).join('|'), options.chatConversationId],
    () => {
      syncSelectedModel(getPersistedModelKey(options.chatConversationId.value || undefined));
    },
    { immediate: true },
  );

  return {
    selectedModelKey,
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
