import { computed, onMounted, onUnmounted, reactive, ref, watch, type Ref } from 'vue';
import type { ChatItem } from './types';

/**
 * The sidebar shows attention needed, not the conversation lifecycle (Active/Archived).
 * Only live runtime evidence may add a status; history list timestamps are not run states.
 */
export type ConversationAttentionStatus = 'failed' | 'input' | 'approval' | 'working' | 'done';

export type ConversationAttentionMap = Readonly<Record<string, ConversationAttentionStatus>>;

export function deriveLiveConversationAttention(
  loading: boolean,
  timeline: readonly ChatItem[],
): Exclude<ConversationAttentionStatus, 'done'> | null {
  // A stream can have multiple requests and approvals; pending approval takes precedence.
  if (
    timeline.some((message) =>
      message.approvals?.some((approval) => ['pending', 'sending'].includes(approval.status)),
    )
  )
    return 'approval';
  if (
    timeline.some((message) =>
      message.nativeRequests?.some((request) => ['pending', 'sending'].includes(request.status)),
    )
  )
    return 'input';
  const latestAssistant = [...timeline].reverse().find((message) => message.role === 'assistant');
  if (latestAssistant?.status === 'error') return 'failed';
  if (latestAssistant?.status === 'interrupted')
    return latestAssistant.workflowInterruption?.confirmation === 'unconfirmed'
      ? 'input'
      : 'failed';
  if (loading) return 'working';
  return null;
}

export function useConversationAttention(input: {
  conversationId: Ref<string>;
  loading: Ref<boolean>;
  timeline: Ref<ChatItem[]>;
  /** Used to distinguish an unseen completion from one rendered in the foreground. */
  isVisible?: () => boolean;
}) {
  // Only terminal outcomes survive a conversation switch within this view. No status is
  // inferred from updatedAt, conversation lifecycle or the presence of a transcript.
  const terminal = reactive<Record<string, 'failed' | 'done'>>({});
  let streamingConversationId = '';
  // The selected ID can change before its asynchronous history replaces the old transcript.
  // Never project another conversation's last error or pending approval onto that new ID.
  const timelineOwnerId = ref(input.conversationId.value);

  const isVisible =
    input.isVisible ??
    (() => {
      return typeof document === 'undefined' || document.visibilityState !== 'hidden';
    });

  function acknowledge(conversationId: string) {
    if (conversationId && terminal[conversationId] === 'done') delete terminal[conversationId];
  }

  function clear(conversationId: string) {
    delete terminal[conversationId];
    if (streamingConversationId === conversationId) streamingConversationId = '';
  }

  function acknowledgeCurrent() {
    if (isVisible()) acknowledge(input.conversationId.value);
  }

  // Sync flush prevents fast consecutive streams from coalescing into a single
  // loading transition and keeps the snapshot owned by the conversation that ran.
  watch(
    input.loading,
    (loading, wasLoading) => {
      if (loading) {
        streamingConversationId = input.conversationId.value;
        if (streamingConversationId) delete terminal[streamingConversationId];
        return;
      }
      if (!wasLoading || !streamingConversationId) return;
      const id = streamingConversationId;
      streamingConversationId = '';
      const lastAssistant = [...input.timeline.value]
        .reverse()
        .find((message) => message.role === 'assistant');
      if (
        lastAssistant?.status === 'error' ||
        (lastAssistant?.status === 'interrupted' &&
          lastAssistant.workflowInterruption?.confirmation !== 'unconfirmed')
      )
        terminal[id] = 'failed';
      else if (lastAssistant?.status === 'success' && !isVisible()) terminal[id] = 'done';
      else delete terminal[id]; // Abort or a visible successful completion is ordinary.
    },
    { flush: 'sync' },
  );

  watch(
    input.conversationId,
    (id, previousId) => {
      if (id !== previousId) timelineOwnerId.value = '';
      // Moving away aborts the current foreground stream: it is not a background
      // Working/Approval indicator after its owner view has been replaced.
      if (previousId && previousId === streamingConversationId && previousId !== id) {
        delete terminal[previousId];
        streamingConversationId = '';
      }
      if (id && input.loading.value) {
        streamingConversationId = id;
        delete terminal[id];
      }
      if (isVisible()) acknowledge(id);
    },
    { flush: 'sync' },
  );

  watch(
    input.timeline,
    () => {
      timelineOwnerId.value = input.conversationId.value;
    },
    { deep: true, flush: 'sync' },
  );

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', acknowledgeCurrent);
    }
    if (typeof window !== 'undefined') window.addEventListener('focus', acknowledgeCurrent);
  });
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', acknowledgeCurrent);
    }
    if (typeof window !== 'undefined') window.removeEventListener('focus', acknowledgeCurrent);
  });

  const statuses = computed<ConversationAttentionMap>(() => {
    const projection: Record<string, ConversationAttentionStatus> = { ...terminal };
    const id = input.conversationId.value;
    if (id) {
      const live =
        timelineOwnerId.value === id
          ? deriveLiveConversationAttention(input.loading.value, input.timeline.value)
          : input.loading.value
            ? 'working'
            : null;
      if (live) projection[id] = live;
      else if (terminal[id]) projection[id] = terminal[id];
      else delete projection[id];
    }
    return projection;
  });

  return { statuses, acknowledge, clear };
}
