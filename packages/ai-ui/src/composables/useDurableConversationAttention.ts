import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { AssistantAttentionView, AssistantAttentionRuntimeKind } from '@memoflow/ai-contracts';
import { aiUiHost } from '../ai-ui-host';
import type { WorkflowRuntimeClient, AssistantRuntimeClient } from '@memoflow/ai-client';
import type {
  ConversationAttentionMap,
  ConversationAttentionStatus,
} from './useConversationAttention';
import type { ConversationSummary } from './types';

const MAX_IDS = 100;
type AttentionItem = AssistantAttentionView;

export function useDurableConversationAttention(input: {
  runtime: AssistantRuntimeClient;
  workspaceRuntime?: WorkflowRuntimeClient;
  conversations: Ref<ConversationSummary[]>;
  activeConversationId: Ref<string>;
  local: Ref<ConversationAttentionMap>;
  loading: Ref<boolean>;
  isVisible?: () => boolean;
}) {
  const snapshots = ref<Record<string, AttentionItem>>({});
  const acknowledged = new Map<string, number>();
  const inFlightAcknowledgements = new Set<string>();
  const versions = new Map<string, number>();
  const streamController = new AbortController();
  let epoch = 0;
  let alive = true;
  let refreshRequest: Promise<boolean> | null = null;
  const isVisible =
    input.isVisible ??
    (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  function kindOf(id: string): AssistantAttentionRuntimeKind {
    return input.conversations.value.find((item) => String(item.id) === id)?.runtimeKind ===
      'local_agent'
      ? 'local_agent'
      : 'builtin';
  }

  async function acknowledge(id: string): Promise<void> {
    const snapshot = snapshots.value[id];
    if (
      !snapshot ||
      snapshot.state !== 'done' ||
      !isVisible() ||
      typeof input.runtime.acknowledgeAttention !== 'function'
    )
      return;
    if (acknowledged.get(id) === snapshot.revision || inFlightAcknowledgements.has(id)) return;
    // Optimistically hide the dot, but only through the acknowledged revision:
    // a later revision must be surfaced even if its acknowledgement races.
    acknowledged.set(id, snapshot.revision);
    inFlightAcknowledgements.add(id);
    try {
      const success = await input.runtime.acknowledgeAttention(id, snapshot.revision, kindOf(id));
      if (!success && acknowledged.get(id) === snapshot.revision) acknowledged.delete(id);
    } catch {
      if (acknowledged.get(id) === snapshot.revision) acknowledged.delete(id);
    } finally {
      inFlightAcknowledgements.delete(id);
    }
  }

  async function refresh(required = false): Promise<void> {
    const request = refreshRequest ?? performRefresh();
    refreshRequest = request;
    const success = await request;
    if (refreshRequest === request) refreshRequest = null;
    if (required && !success) throw new Error('Attention snapshot unavailable');
  }

  async function performRefresh(): Promise<boolean> {
    // Support older test/runtime surfaces without falsely projecting a status.
    if (typeof input.runtime.listAttention !== 'function') return true;
    const currentEpoch = ++epoch;
    const conversationScope = JSON.stringify(
      input.conversations.value.map((item) => [item.id, item.runtimeKind]),
    );
    const versionsBefore = new Map(versions);
    const lists: Record<AssistantAttentionRuntimeKind, string[]> = {
      builtin: [],
      local_agent: [],
    };
    for (const item of input.conversations.value) {
      const id = String(item.id);
      lists[kindOf(id)].push(id);
    }
    const batches: Array<{
      kind: AssistantAttentionRuntimeKind;
      ids: string[];
    }> = [];
    for (const kind of ['builtin', 'local_agent'] as const) {
      for (let i = 0; i < lists[kind].length; i += MAX_IDS) {
        batches.push({ kind, ids: lists[kind].slice(i, i + MAX_IDS) });
      }
    }
    const results = await Promise.allSettled(
      batches.map(({ kind, ids }) => input.runtime.listAttention(ids, kind)),
    );
    if (!alive || currentEpoch !== epoch) return false;
    // A newly discovered conversation must receive its own snapshot even if
    // its watcher joined a request that was already in flight.
    if (
      conversationScope !==
      JSON.stringify(input.conversations.value.map((item) => [item.id, item.runtimeKind]))
    )
      return performRefresh();
    const next: Record<string, AttentionItem> = {};
    const requested = new Set(input.conversations.value.map((item) => String(item.id)));
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index]!;
      const result = results[index]!;
      if (result.status === 'rejected') {
        // Fail closed rather than retaining potentially stale Working indefinitely.
        continue;
      }
      const allowed = new Set(batch.ids);
      for (const item of result.value) {
        if (
          allowed.has(item.conversationId) &&
          requested.has(item.conversationId) &&
          item.runtimeKind === batch.kind
        )
          next[item.conversationId] = item;
      }
    }
    for (const id of requested) {
      const incoming = next[id];
      const currentVersion = versions.get(id) ?? 0;
      const snapshotVersion = incoming?.resourceVersion ?? 0;
      if (
        (incoming && snapshotVersion < currentVersion) ||
        (!incoming && currentVersion !== (versionsBefore.get(id) ?? 0))
      ) {
        if (snapshots.value[id]) next[id] = snapshots.value[id]!;
        else delete next[id];
      } else if (incoming?.resourceVersion) versions.set(id, incoming.resourceVersion);
    }
    for (const id of versions.keys()) if (!requested.has(id)) versions.delete(id);
    for (const id of acknowledged.keys()) if (!requested.has(id)) acknowledged.delete(id);
    snapshots.value = next;
    const current = input.activeConversationId.value;
    if (current && isVisible()) void acknowledge(current);
    return results.every((result) => result.status === 'fulfilled');
  }

  function onAttentionVisible() {
    if (!isVisible()) return;
    const current = input.activeConversationId.value;
    if (current && isVisible()) void acknowledge(current);
    void refresh();
  }

  watch(
    () =>
      JSON.stringify(input.conversations.value.map((item) => [String(item.id), item.runtimeKind])),
    () => {
      void refresh();
    },
    { deep: false },
  );
  watch(input.activeConversationId, (id) => {
    if (id && isVisible()) void acknowledge(id);
  });
  watch(input.loading, (loading, old) => {
    if (old && !loading && !input.workspaceRuntime?.streamWorkspaceEvents) void refresh();
  });

  onMounted(() => {
    alive = true;
    if (input.workspaceRuntime?.streamWorkspaceEvents) {
      void aiUiHost
        .subscribeWorkspaceEvents(input.workspaceRuntime, {
          signal: streamController.signal,
          onEvent: async (event) => {
            if (!alive) return;
            if (event.type === 'stream.reset_required') {
              versions.clear();
              snapshots.value = {};
              await refresh(true);
            } else if (event.type === 'stream.ready') {
              if (refreshRequest) await refreshRequest;
              await refresh(true);
            } else if (event.type === 'attention.changed') {
              const { conversationId: id, runtimeKind, attention } = event.data;
              if (
                !input.conversations.value.some((item) => String(item.id) === id) ||
                kindOf(id) !== runtimeKind ||
                event.resourceVersion <= (versions.get(id) ?? 0)
              )
                return;
              versions.set(id, event.resourceVersion);
              if (attention) snapshots.value = { ...snapshots.value, [id]: attention };
              else {
                const next = { ...snapshots.value };
                delete next[id];
                snapshots.value = next;
              }
              if (id === input.activeConversationId.value && isVisible()) void acknowledge(id);
            }
          },
        })
        .catch(() => {
          /* Foreground or explicit refresh can recover a failed projection. */
        });
    } else void refresh();
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', onAttentionVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onAttentionVisible);
  });
  onUnmounted(() => {
    alive = false;
    epoch++;
    streamController.abort();
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onAttentionVisible);
    if (typeof window !== 'undefined') window.removeEventListener('focus', onAttentionVisible);
  });

  const statuses = computed<ConversationAttentionMap>(() => {
    const map: Record<string, ConversationAttentionStatus> = {};
    for (const [id, snapshot] of Object.entries(snapshots.value)) {
      if (snapshot.state === 'normal') continue;
      if (
        snapshot.state === 'done' &&
        (snapshot.seenRevision >= snapshot.revision ||
          (acknowledged.get(id) ?? 0) >= snapshot.revision ||
          (id === input.activeConversationId.value && isVisible()))
      )
        continue;
      map[id] = snapshot.state;
    }
    // Active foreground events outrank a lagging snapshot; after the run settles,
    // the durable server revision takes precedence over stale local terminals.
    for (const [id, state] of Object.entries(input.local.value)) {
      // In-progress foreground events outrank a lagging snapshot. Once the turn
      // settles, the authoritative durable revision wins over old local state.
      if (id === input.activeConversationId.value && (input.loading.value || !snapshots.value[id]))
        map[id] = state;
    }
    return map;
  });

  return { statuses, refresh, acknowledge };
}
