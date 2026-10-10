import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import type { AgentConversationSelection, AgentRegistrySnapshot } from '@memoflow/contracts/ai';
import type { ChatModelOption, PersistedConversationModelMap, ProviderListItem } from './types';

const LAST_MODEL_STORAGE_KEY = 'ai:last-model-key';
const CONVERSATION_MODEL_STORAGE_KEY = 'ai:conversation-model-map';

export interface UseAIModelSelectionOptions {
  providers: Ref<ProviderListItem[]>;
  /** When available, the Agent Registry is authoritative for new conversation choices. */
  agentRegistrySnapshot?: Ref<AgentRegistrySnapshot | null>;
  chatConversationId: Ref<string>;
  readConversationSelection?: (
    conversationId: string,
  ) => Promise<AgentConversationSelection | null>;
}

export function useAIModelSelection(options: UseAIModelSelectionOptions) {
  const { t } = useI18n();
  const selectedModelKey = ref('');
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
            const model = provider.availableModels?.find((entry) => entry.id === binding.modelId);
            const providerName = `${instance.name} · ${provider.name || t('common.unknown')}`;
            return [
              {
                providerId: `agent:${instance.instanceId}:${binding.connectionId}`,
                providerName,
                models: [
                  {
                    key: `agent:${instance.instanceId}::${binding.connectionId}::${binding.modelId}`,
                    agentInstanceId: instance.instanceId,
                    providerId: provider.id,
                    providerName,
                    modelId: binding.modelId,
                    modelName: model?.name || binding.modelId,
                  },
                ],
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
  const canSendMessage = computed(() => !selectionLoading.value && selectedModel.value !== null);

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
      if (allModelOptions.value.some((item) => item.key === candidate)) {
        selectedModelKey.value = candidate;
        persistSelectedModel(candidate, options.chatConversationId.value || undefined);
        return;
      }
    }

    const defaultProvider =
      options.providers.value.find((item) => item.isDefault) || options.providers.value[0] || null;

    const defaultOption =
      (defaultProvider?.defaultModel
        ? allModelOptions.value.find(
            (item) =>
              item.providerId === defaultProvider.id &&
              item.modelId === defaultProvider.defaultModel,
          )
        : null) ||
      allModelOptions.value.find((item) => item.providerId === defaultProvider?.id) ||
      allModelOptions.value[0];

    selectedModelKey.value = defaultOption?.key || '';
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
    selectedModelKey.value = modelKey;
    persistSelectedModel(modelKey, conversationId || undefined);
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
