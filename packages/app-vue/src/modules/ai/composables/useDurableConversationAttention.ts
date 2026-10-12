import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { AssistantAttentionView, AssistantAttentionRuntimeKind } from '@memoflow/contracts/ai';
import type { AssistantRuntimeClient } from '@memoflow/ai/client';
import type {
  ConversationAttentionMap,
  ConversationAttentionStatus,
} from './useConversationAttention';
import type { ConversationSummary } from './types';

const POLL_MS = 5_000;
const MAX_IDS = 100;
type AttentionItem = AssistantAttentionView;

export function useDurableConversationAttention(input: {
  runtime: AssistantRuntimeClient;
  conversations: Ref<ConversationSummary[]>;
  activeConversationId: Ref<string>;
  local: Ref<ConversationAttentionMap>;
  loading: Ref<boolean>;
  isVisible?: () => boolean;
}) {
  const snapshots = ref<Record<string, AttentionItem>>({});
  const acknowledged = new Map<string, number>();
  const inFlightAcknowledgements = new Set<string>();
  let interval: ReturnType<typeof setInterval> | undefined;
  let epoch = 0;
  let alive = true;
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

  async function refresh(): Promise<void> {
    // Support older test/runtime surfaces without falsely projecting a status.
    if (typeof input.runtime.listAttention !== 'function') return;
    const currentEpoch = ++epoch;
    const lists: Record<AssistantAttentionRuntimeKind, string[]> = {
      builtin: [],
      local_agent: [],
    };
    for (const item of input.conversations.value) {
      const id = String(item.id);
      lists[kindOf(id)].push(id);
    }
    const batches: Array<{ kind: AssistantAttentionRuntimeKind; ids: string[] }> = [];
    for (const kind of ['builtin', 'local_agent'] as const) {
      for (let i = 0; i < lists[kind].length; i += MAX_IDS) {
        batches.push({ kind, ids: lists[kind].slice(i, i + MAX_IDS) });
      }
    }
    const results = await Promise.allSettled(
      batches.map(({ kind, ids }) => input.runtime.listAttention(ids, kind)),
    );
    if (!alive || currentEpoch !== epoch) return;
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
    snapshots.value = next;
    const current = input.activeConversationId.value;
    if (current && isVisible()) void acknowledge(current);
  }

  function onAttentionVisible() {
    const current = input.activeConversationId.value;
    if (current && isVisible()) void acknowledge(current);
    void refresh();
  }

  watch(
    input.conversations,
    () => {
      void refresh();
    },
    { deep: false },
  );
  watch(input.activeConversationId, (id) => {
    if (id && isVisible()) void acknowledge(id);
  });
  watch(input.loading, (loading, old) => {
    if (old && !loading) void refresh();
  });

  onMounted(() => {
    alive = true;
    void refresh();
    interval = setInterval(() => {
      void refresh();
    }, POLL_MS);
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', onAttentionVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onAttentionVisible);
  });
  onUnmounted(() => {
    alive = false;
    epoch++;
    if (interval) clearInterval(interval);
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
    // Active foreground events outrank a lagging poll; after the run settles,
    // the durable server revision takes precedence over stale local terminals.
    for (const [id, state] of Object.entries(input.local.value)) {
      // In-progress foreground events outrank a lagging poll. Once the turn
      // settles, the authoritative durable revision wins over old local state.
      if (id === input.activeConversationId.value && (input.loading.value || !snapshots.value[id]))
        map[id] = state;
    }
    return map;
  });

  return { statuses, refresh, acknowledge };
}
