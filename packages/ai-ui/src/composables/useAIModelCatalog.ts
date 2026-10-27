import { computed, onScopeDispose, ref, watch } from 'vue';
import type { AgentRegistryClient, LocalAgentClient } from '@memoflow/ai-client';
import type {
  AgentInstance,
  AgentRegistrySnapshot,
  AIModelInfo,
  LocalAgentModel,
  LocalAgentStatus,
} from '@memoflow/ai-contracts';
import type { ChatModelOption } from './types';
import { useNativeModelVisibility } from './nativeModelVisibility';

export type ComposerModel = ChatModelOption & { agentKey: string } & Partial<
    Pick<
      LocalAgentModel,
      'reasoningEfforts' | 'defaultReasoningEffort' | 'serviceTiers' | 'defaultServiceTier'
    >
  >;
export interface InstanceModelCatalog {
  instanceId: string;
  agentKey: string;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
  models: ComposerModel[];
  reason?: 'not_installed' | 'login_required' | 'unavailable' | 'discovery_failed';
}
export type ModelCatalog = Readonly<Record<string, InstanceModelCatalog>>;

/** Catalog eligibility only; callers must additionally enforce session switching constraints.
 * Discovery proves current directory membership, never inference/quota readiness. */
export function listSelectableModels(catalog: ModelCatalog, instanceId?: string): ComposerModel[] {
  return Object.values(catalog)
    .filter(
      (entry) =>
        entry.status === 'ready' && (instanceId === undefined || entry.instanceId === instanceId),
    )
    .flatMap((entry) => entry.models);
}
export function isModelSelectable(
  catalog: ModelCatalog,
  instanceId: string,
  modelId: string,
): boolean {
  return listSelectableModels(catalog, instanceId).some((model) => model.modelId === modelId);
}
export function composerAgentKey(instance: AgentInstance): string {
  return instance.driver === 'mastra'
    ? `agent:${instance.instanceId}`
    : `local:${instance.legacyConnectionId ?? instance.instanceId}`;
}

interface Options {
  resolveIdentity: () => string;
  registry?: Pick<AgentRegistryClient, 'list'>;
  native?: Pick<
    LocalAgentClient,
    'probeConnection' | 'probeDefaultDriver' | 'cachedCatalogConnection'
  >;
  refreshProviderModels: (id: string) => Promise<{ models: AIModelInfo[] }>;
}
/** One ephemeral directory for all enabled instances in this identity/profile.
 * Only read ports are accepted: browsing cannot materialize connections or run inference. */
export function useAIModelCatalog(options: Options) {
  const snapshot = ref<AgentRegistrySnapshot | null>(null);
  const rawEntries = ref<Record<string, InstanceModelCatalog>>({});
  const providerCatalogs = ref<Record<string, AIModelInfo[]>>({});
  const nativeStatuses = ref<Record<string, LocalAgentStatus>>({});
  const loading = ref(false);
  const visibility = useNativeModelVisibility(options.resolveIdentity, () => undefined);
  let owner = options.resolveIdentity();
  let epoch = 0;
  let disposed = false;
  const current = (request: number, identity: string) =>
    !disposed && request === epoch && identity === options.resolveIdentity();
  function invalidate() {
    ++epoch;
    owner = options.resolveIdentity();
    snapshot.value = null;
    rawEntries.value = {};
    providerCatalogs.value = {};
    nativeStatuses.value = {};
    loading.value = false;
  }
  watch(options.resolveIdentity, invalidate, { flush: 'sync' });
  onScopeDispose(() => {
    disposed = true;
    ++epoch;
  });
  const entries = computed<ModelCatalog>(() => {
    if (owner !== options.resolveIdentity()) return {};
    return Object.fromEntries(
      Object.entries(rawEntries.value).map(([id, entry]) => {
        const status = nativeStatuses.value[id];
        return [
          id,
          {
            ...entry,
            models:
              status?.status === 'ready'
                ? entry.models.filter((model) =>
                    visibility.isVisible(id, model.modelId, status.modelVisibilityContext),
                  )
                : entry.models,
          },
        ];
      }),
    );
  });
  async function refresh() {
    const request = ++epoch;
    const identity = options.resolveIdentity();
    if (owner !== identity) {
      invalidate();
      return refresh();
    }
    if (!options.registry) return;
    loading.value = true;
    // T3-style stale-while-refresh: retain the exact Profile's previous
    // verified view while the new Registry is read. A changed instance
    // revision/connection will be invalidated below, never sent to ACP blindly.
    const previousSnapshot = snapshot.value;
    const previousEntries = rawEntries.value;
    try {
      const next = await options.registry.list();
      if (!current(request, identity)) return;
      const enabledConnections = new Set(
        next.bindings
          .filter((binding) =>
            next.instances.some(
              (instance) => instance.enabled && instance.instanceId === binding.instanceId,
            ),
          )
          .map((binding) => binding.connectionId),
      );
      providerCatalogs.value = Object.fromEntries(
        Object.entries(providerCatalogs.value).filter(([id]) => enabledConnections.has(id)),
      );
      snapshot.value = next;
      const enabled = next.instances.filter((instance) => instance.enabled);
      rawEntries.value = Object.fromEntries(
        enabled.map((instance) => {
          const previousInstance = previousSnapshot?.instances.find(
            (entry) => entry.instanceId === instance.instanceId,
          );
          const previous = previousEntries[instance.instanceId];
          const stable =
            previous?.status === 'ready' &&
            previous.agentKey === composerAgentKey(instance) &&
            previousInstance?.driver === instance.driver &&
            previousInstance.revision === instance.revision &&
            previousInstance.legacyConnectionId === instance.legacyConnectionId;
          return [
            instance.instanceId,
            stable
              ? previous
              : {
                  instanceId: instance.instanceId,
                  agentKey: composerAgentKey(instance),
                  status: 'loading',
                  models: [],
                },
          ];
        }),
      );
      const requests = new Map<string, Promise<AIModelInfo[]>>();
      const requestProvider = (id: string) => {
        let promise = requests.get(id);
        if (!promise) {
          promise = options.refreshProviderModels(id).then((result) => {
            if (current(request, identity))
              providerCatalogs.value = {
                ...providerCatalogs.value,
                [id]: result.models,
              };
            return result.models;
          });
          promise = promise.catch((error: unknown) => {
            if (current(request, identity))
              providerCatalogs.value = { ...providerCatalogs.value, [id]: [] };
            throw error;
          });
          requests.set(id, promise);
        }
        return promise;
      };
      await Promise.all(
        enabled.map(async (instance) => {
          const agentKey = composerAgentKey(instance);
          let result: InstanceModelCatalog = {
            instanceId: instance.instanceId,
            agentKey,
            status: 'ready',
            models: [],
          };
          try {
            if (instance.driver === 'mastra') {
              const bindings = next.bindings.filter(
                (binding) => binding.instanceId === instance.instanceId,
              );
              const groups = await Promise.all(
                bindings.map(async (binding) => {
                  const inventory = await requestProvider(binding.connectionId);
                  const ordered = [
                    ...inventory.filter((m) => m.id === binding.modelId),
                    ...inventory.filter((m) => m.id !== binding.modelId),
                  ];
                  return ordered.map((model) => ({
                    key: `agent:${instance.instanceId}::${binding.connectionId}::${model.id}`,
                    agentKey,
                    agentInstanceId: instance.instanceId,
                    providerId: binding.connectionId,
                    providerName: instance.name,
                    modelId: model.id,
                    modelName: model.name || model.id,
                  }));
                }),
              );
              result.models = groups.flat();
            } else if (options.native) {
              // Provider settings has already verified this exact AGY account
              // and config. Use its profile-owned observation for browsing;
              // only fall back to a new ACP process when no proof is available.
              const verified =
                instance.driver === 'antigravity' && instance.legacyConnectionId
                  ? await options.native.cachedCatalogConnection(instance.legacyConnectionId)
                  : null;
              if (!current(request, identity)) return;
              const status =
                verified ??
                (instance.legacyConnectionId
                  ? await options.native.probeConnection(instance.legacyConnectionId)
                  : await options.native.probeDefaultDriver(instance.driver));
              if (!current(request, identity)) return;
              nativeStatuses.value = {
                ...nativeStatuses.value,
                [instance.instanceId]: status,
              };
              if (status.status === 'ready')
                result.models = status.models.map((model) => ({
                  ...model,
                  key: model.id,
                  agentKey,
                  agentInstanceId: instance.instanceId,
                  providerId: instance.legacyConnectionId ?? instance.instanceId,
                  providerName: model.provider ?? instance.name,
                  modelId: model.id,
                  modelName: model.name,
                }));
              else
                result = {
                  ...result,
                  status: 'unavailable',
                  reason: status.status,
                };
            } else
              result = {
                ...result,
                status: 'unavailable',
                reason: 'unavailable',
              };
          } catch {
            result = {
              ...result,
              status: 'error',
              models: [],
              reason: 'discovery_failed',
            };
          }
          if (current(request, identity))
            rawEntries.value = {
              ...rawEntries.value,
              [instance.instanceId]: result,
            };
        }),
      );
    } catch {
      if (current(request, identity)) {
        snapshot.value = null;
        rawEntries.value = {};
      }
    } finally {
      if (current(request, identity)) loading.value = false;
    }
  }
  return {
    snapshot: computed(() => snapshot.value),
    entries,
    providerCatalogs: computed(() => providerCatalogs.value),
    nativeStatuses: computed(() => nativeStatuses.value),
    loading: computed(() => loading.value),
    refresh,
  };
}
