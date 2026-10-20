import { computed, ref, watch, type Ref } from 'vue';
import { useNativeModelVisibility } from './nativeModelVisibility';
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
  resolveIdentity: () => string = () => '',
) {
  const connections = ref<LocalAgentConnection[]>([]);
  const defaultChoice = ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' });
  const status = ref<LocalAgentStatus | null>(null);
  const modelVisibility = useNativeModelVisibility(resolveIdentity, () =>
    status.value?.status === 'ready' ? status.value.modelVisibilityContext : undefined,
  );
  const loading = ref(false);
  const error = ref(false);
  let generation = 0;
  let refreshGeneration = 0;
  let refreshingConfiguration = false;
  async function refresh() {
    if (!client) return;
    const request = ++refreshGeneration;
    refreshingConfiguration = true;
    // A new configuration/identity snapshot must never inherit the previous
    // Profile's successful model probe (even if a connection ID is reused).
    ++generation;
    status.value = null;
    loading.value = false;
    try {
      const [items, saved] = await Promise.all([
        client.listConnections(),
        client.getDefaultChoice(),
      ]);
      if (request !== refreshGeneration) return;
      connections.value = items;
      defaultChoice.value = saved;
      error.value = false;
      // Only the current Profile snapshot may initiate a fresh model probe.
      refreshingConfiguration = false;
      const selected = choice.value;
      if (
        selected.runtimeKind === 'local_agent' &&
        items.some((connection) => connection.id === selected.connectionId && connection.enabled)
      )
        await probe(selected.connectionId);
    } catch {
      if (request !== refreshGeneration) return;
      // Fail closed instead of advertising a previously usable connection.
      connections.value = [];
      defaultChoice.value = { runtimeKind: 'builtin' };
      error.value = true;
    } finally {
      if (request === refreshGeneration) refreshingConfiguration = false;
    }
  }
  async function probe(connectionId: string, options: { fresh?: boolean } = {}) {
    // An explicit check or selection watch during a Profile refresh must not
    // resurrect an old Profile's catalog before its new registry is loaded.
    if (!client || refreshingConfiguration) return;
    const request = ++generation;
    loading.value = true;
    status.value = null;
    try {
      const connection = connections.value.find((item) => item.id === connectionId);
      // Workspace can reuse the same Profile-owned verified catalog as Settings.
      // The native source and OAuth identity are checked by Desktop on every read.
      const cached =
        !options.fresh && connection?.driver === 'antigravity'
          ? await client.cachedCatalogConnection(connectionId)
          : null;
      if (request !== generation) return;
      const result = cached ?? (await client.probeConnection(connectionId));
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
  const models = computed(() => {
    if (status.value?.status !== 'ready' || choice.value.runtimeKind !== 'local_agent') return [];
    const id = choice.value.connectionId;
    const instanceId =
      connections.value.find((connection) => connection.id === id)?.instanceSlug ?? id;
    return status.value.models.filter((model) => modelVisibility.isVisible(instanceId, model.id));
  });
  const lastExecutionFailure = computed(() =>
    status.value?.status === 'ready' &&
    choice.value.runtimeKind === 'local_agent' &&
    status.value.lastExecutionFailure?.modelId === choice.value.modelId
      ? status.value.lastExecutionFailure
      : undefined,
  );
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
    lastExecutionFailure,
    loading,
    error,
    models,
    canSend,
    refresh,
    probe,
    saveDefault,
  };
}
