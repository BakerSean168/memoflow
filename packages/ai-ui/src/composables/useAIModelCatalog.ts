import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
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

/** Application-level directory state. Holding it outside the chat view keeps a
 * presented catalog alive across AIChatView remounts; it is never persisted and
 * never authorizes inference. */
export interface AIModelCatalogState {
  snapshot: Ref<AgentRegistrySnapshot | null>;
  rawEntries: Ref<Record<string, InstanceModelCatalog>>;
  providerCatalogs: Ref<Record<string, AIModelInfo[]>>;
  nativeStatuses: Ref<Record<string, LocalAgentStatus>>;
  loading: Ref<boolean>;
  /** Reactive so a conditional early return in `entries` still re-evaluates. */
  owner: Ref<string>;
  epoch: number;
}
export function createAIModelCatalogState(): AIModelCatalogState {
  return {
    snapshot: ref(null),
    rawEntries: ref({}),
    providerCatalogs: ref({}),
    nativeStatuses: ref({}),
    loading: ref(false),
    owner: ref(''),
    epoch: 0,
  };
}
// One state per injected client pair, so an AIChatView remount reuses the
// presented catalog while tests and other surfaces stay isolated.
const sharedStates = new WeakMap<object, AIModelCatalogState>();
let fallbackState: AIModelCatalogState | undefined;
export function sharedAIModelCatalogState(host: object | undefined): AIModelCatalogState {
  if (!host) return (fallbackState ??= createAIModelCatalogState());
  let state = sharedStates.get(host);
  if (!state) {
    state = createAIModelCatalogState();
    sharedStates.set(host, state);
  }
  return state;
}

interface Options {
  resolveIdentity: () => string;
  registry?: Pick<AgentRegistryClient, 'list'>;
  native?: Pick<
    LocalAgentClient,
    'probeConnection' | 'probeDefaultDriver' | 'cachedCatalogConnection'
  >;
  refreshProviderModels: (id: string) => Promise<{ models: AIModelInfo[] }>;
  /** Periodic stale-while-revalidate of an already presented catalog. */
  autoRevalidate?: boolean;
}
interface RefreshOptions {
  /** Ignore the native directory snapshot and probe every enabled instance. */
  fresh?: boolean;
  /** Only discover entries that were never presented or previously failed. */
  onlyMissing?: boolean;
}
const REVALIDATE_INTERVAL_MS = 5 * 60_000;

/** One ephemeral directory for all enabled instances in this identity/profile.
 * Only read ports are accepted: browsing cannot materialize connections or run inference. */
export function useAIModelCatalog(options: Options, state = createAIModelCatalogState()) {
  const { snapshot, rawEntries, providerCatalogs, nativeStatuses, loading } = state;
  const visibility = useNativeModelVisibility(options.resolveIdentity, () => undefined);
  if (!state.owner.value) state.owner.value = options.resolveIdentity();
  let disposed = false;
  let revalidateTimer: ReturnType<typeof setTimeout> | undefined;
  const current = (request: number, identity: string) =>
    !disposed && request === state.epoch && identity === options.resolveIdentity();
  function invalidate() {
    ++state.epoch;
    state.owner.value = options.resolveIdentity();
    snapshot.value = null;
    rawEntries.value = {};
    providerCatalogs.value = {};
    nativeStatuses.value = {};
    loading.value = false;
  }
  watch(options.resolveIdentity, invalidate, { flush: 'sync' });
  onScopeDispose(() => {
    disposed = true;
    ++state.epoch;
    if (revalidateTimer) clearTimeout(revalidateTimer);
  });
  const entries = computed<ModelCatalog>(() => {
    if (state.owner.value !== options.resolveIdentity()) return {};
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

  async function discoverNative(
    instance: AgentInstance,
    agentKey: string,
    request: number,
    identity: string,
    refreshOptions: RefreshOptions,
  ): Promise<InstanceModelCatalog> {
    let result: InstanceModelCatalog = {
      instanceId: instance.instanceId,
      agentKey,
      status: 'ready',
      models: [],
    };
    // Only native drivers own a directory; the caller handles Mastra instances.
    if (instance.driver === 'mastra') return result;
    try {
      // A presented directory is always read first. It comes from this exact
      // Profile and connection revision, so no native process is needed to
      // populate the picker on a cold start.
      const cached =
        refreshOptions.fresh || !options.native
          ? null
          : ((await options.native.cachedCatalogConnection?.(
              instance.legacyConnectionId ?? `implicit:${instance.driver}`,
            )) ?? null);
      if (!current(request, identity)) return result;
      const status =
        cached ??
        (options.native
          ? instance.legacyConnectionId
            ? await options.native.probeConnection(instance.legacyConnectionId)
            : await options.native.probeDefaultDriver(instance.driver)
          : null);
      if (!current(request, identity) || !status) return result;
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
    } catch {
      // A failed revalidation must not erase a directory already presented to
      // the user; only a first discovery without models becomes an error.
      result = {
        ...result,
        status: 'error',
        models: [],
        reason: 'discovery_failed',
      };
    }
    return result;
  }

  async function refresh(refreshOptions: RefreshOptions = {}) {
    const request = ++state.epoch;
    const identity = options.resolveIdentity();
    if (state.owner.value !== identity) {
      invalidate();
      return refresh(refreshOptions);
    }
    if (!options.registry) return;
    loading.value = true;
    // T3-style stale-while-refresh: retain the exact Profile's previous
    // verified view while the new Registry is read. A changed instance
    // revision/connection will be invalidated below, never sent to the native
    // driver blindly.
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
        const presented = providerCatalogs.value[id];
        if (refreshOptions.onlyMissing && !refreshOptions.fresh && presented) {
          return Promise.resolve(presented);
        }
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
          const presented = previousEntries[instance.instanceId];
          if (refreshOptions.onlyMissing && presented?.status === 'ready') {
            // Opening a picker must not restart discovery. Keep the presented
            // models, but rebind them to this instance's current connection so a
            // just-materialized native default is selectable without a probe.
            const providerId = instance.legacyConnectionId ?? instance.instanceId;
            rawEntries.value = {
              ...rawEntries.value,
              [instance.instanceId]: {
                ...presented,
                agentKey,
                models: presented.models.map((model) => ({
                  ...model,
                  agentKey,
                  providerId,
                })),
              },
            };
            return;
          }
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
              result = await discoverNative(instance, agentKey, request, identity, refreshOptions);
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
          if (!current(request, identity)) return;
          const fallback = previousEntries[instance.instanceId];
          rawEntries.value = {
            ...rawEntries.value,
            [instance.instanceId]:
              result.status === 'error' && fallback?.status === 'ready' ? fallback : result,
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
    scheduleRevalidation();
  }

  /** Opening a picker reads what is already presented and only fills gaps. */
  function ensureLoaded() {
    return refresh({ onlyMissing: true });
  }

  function scheduleRevalidation() {
    if (!options.autoRevalidate || disposed) return;
    if (revalidateTimer) clearTimeout(revalidateTimer);
    revalidateTimer = setTimeout(() => {
      revalidateTimer = undefined;
      if (!disposed) void refresh({ fresh: true });
    }, REVALIDATE_INTERVAL_MS);
  }

  return {
    snapshot: computed(() => snapshot.value),
    entries,
    providerCatalogs: computed(() => providerCatalogs.value),
    nativeStatuses: computed(() => nativeStatuses.value),
    loading: computed(() => loading.value),
    refresh,
    ensureLoaded,
  };
}
