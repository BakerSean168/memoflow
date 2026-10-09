import { computed, ref, watch, type Ref } from 'vue';
import type { LocalAgentClient } from '@memoflow/ai/client';
import type {
  AssistantRuntimeChoice,
  LocalAgentConnection,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';

/** Presentation only: discovery is explicit and never sends an inference request. */
export function useLocalAssistantChoices(
  client: LocalAgentClient | undefined,
  choice: Ref<AssistantRuntimeChoice>,
) {
  const connections = ref<LocalAgentConnection[]>([]);
  const defaultChoice = ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' });
  const status = ref<LocalAgentStatus | null>(null);
  const loading = ref(false);
  const error = ref(false);
  let generation = 0;
  async function refresh() {
    if (!client) return;
    try {
      const [items, saved] = await Promise.all([
        client.listConnections(),
        client.getDefaultChoice(),
      ]);
      connections.value = items;
      defaultChoice.value = saved;
      error.value = false;
    } catch {
      error.value = true;
    }
  }
  async function probe(connectionId: string) {
    if (!client) return;
    const request = ++generation;
    loading.value = true;
    status.value = null;
    try {
      const result = await client.probeConnection(connectionId);
      if (request === generation) {
        status.value = result;
        error.value = false;
      }
    } catch {
      if (request === generation) error.value = true;
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  watch(
    () => (choice.value.runtimeKind === 'local_agent' ? choice.value.connectionId : null),
    (id) => {
      generation++;
      status.value = null;
      loading.value = false;
      if (id) void probe(id);
    },
  );
  const models = computed(() => (status.value?.status === 'ready' ? status.value.models : []));
  const canSend = computed(
    () =>
      choice.value.runtimeKind === 'local_agent' &&
      connections.value.some(
        (c) =>
          c.id === (choice.value.runtimeKind === 'local_agent' ? choice.value.connectionId : '') &&
          c.enabled,
      ) &&
      models.value.some((model) => model.id === choice.value.modelId),
  );
  async function saveDefault() {
    if (!client) return;
    await client.setDefaultChoice(choice.value);
    defaultChoice.value = { ...choice.value };
  }
  return {
    available: Boolean(client),
    connections,
    defaultChoice,
    status,
    loading,
    error,
    models,
    canSend,
    refresh,
    probe,
    saveDefault,
  };
}
