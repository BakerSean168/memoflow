import type {
  AssistantRuntimeClient,
  WorkflowRuntimeClient,
  RuntimeUsageClient,
  LocalAgentClient,
} from '@memoflow/ai-client';
import type { AIRuntimeSurface, AIChatPermissionMode } from '@memoflow/ai-contracts';
import { nextTick, ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { getAIErrorMessage } from './error';
import type { AIChatService } from './types';
import { useAIComposerContext } from './useAIComposerContext';
import { useAssistantStream } from './useAssistantStream';
import { useConversationProjection } from './useConversationProjection';
import {
  useConversationAttention,
  type ConversationAttentionStatus,
} from './useConversationAttention';
import { useDurableConversationAttention } from './useDurableConversationAttention';

const STREAM_AUTO_FOLLOW_THRESHOLD_PX = 96;
export interface UseAIChatSessionOptions {
  /** Transitional shell/workflow client. Open-chat transcript execution never uses it. */
  service: AIChatService;
  localAgent?: LocalAgentClient;
  /** Refresh a native discovery snapshot once after an observed terminal result; never retry inference. */
  onNativeRunSettled?: (connectionId: string) => void;
  getPermissionMode?: () => AIChatPermissionMode;
  getNativeModelOptions?: () => import('@memoflow/ai-contracts').LocalAgentModelOptions | undefined;
  getDefaultRuntimeChoice?: () => import('@memoflow/ai-contracts').AssistantRuntimeChoice;
  /** Mastra-native authoritative history/stream/cancel client. */
  runtime: AssistantRuntimeClient;
  workspaceRuntime?: WorkflowRuntimeClient;
  /** Durable conversation/run usage projection. */
  usageRuntime: RuntimeUsageClient;
  /** Host-provided Assistant surface tag (web / desktop / server). */
  surface: AIRuntimeSurface;
  getDefaultConversationName: (mode: string) => string;
  onConversationCreated?: (id: string) => void;
  restoreWorkflowState?: (id: string) => void;
}

export function useAIChatSession(options: UseAIChatSessionOptions) {
  const { t } = useI18n();

  const chatMessage = ref('');
  const messagesViewport = ref<HTMLElement | null>(null);
  const composerTextarea = ref<HTMLTextAreaElement | null>(null);
  const composer = useAIComposerContext();
  const {
    composerAttachments,
    composerContextEntities,
    addComposerFiles,
    removeComposerAttachment,
    toggleExplicitContextEntity,
    setSurfaceContextEntity,
    removeContextEntity,
    clearComposerTurnState,
    clearComposerContext,
  } = composer;
  const conversation = useConversationProjection({
    options,
    abortActiveStream: () => stream.abortActiveStream(),
    clearComposerContext,
    startNewConversation: () => startNewConversation(),
  });
  const {
    runtimeChoice,
    historyIncomplete,
    chatConversationId,
    chatTimeline,
    conversationTitle,
    conversationListLoading,
    conversationList,
    conversationProjectionLive,
    lastActiveConversationId,
    lastRuntimeUsage,
    hasWorkflowMessages,
    hasWorkflowUserMessages,
    updateLastActiveConversation,
    clearLastActiveConversation,
    loadConversationList,
    markConversationActivity,
    syncConversationSummary,
    refreshRuntimeUsage,
    selectConversation,
    deleteConversation,
    ensureConversationCreated,
    normalizeChatItem,
  } = conversation;
  const stream = useAssistantStream({
    options,
    chatMessage,
    conversation,
    composer,
  });
  const attention = useConversationAttention({
    conversationId: chatConversationId,
    loading: stream.chatLoading,
    timeline: chatTimeline,
  });
  const durableAttention = useDurableConversationAttention({
    runtime: options.runtime,
    workspaceRuntime: options.workspaceRuntime,
    conversations: conversationList,
    activeConversationId: chatConversationId,
    local: attention.statuses,
    loading: stream.chatLoading,
  });
  const {
    chatLoading,
    activeStreamAbortController,
    activeRuntimeRunId,
    abortActiveStream,
    stopGenerating,
    decideToolApproval,
    handleSendChat,
  } = stream;

  async function selectConversationWithAttention(...args: Parameters<typeof selectConversation>) {
    attention.acknowledge(args[0].id);
    await selectConversation(...args);
  }

  async function deleteConversationWithAttention(...args: Parameters<typeof deleteConversation>) {
    const id = args[0];
    const wasListed = conversationList.value.some((item) => item.id === id);
    const success = await deleteConversation(...args);
    if (wasListed && !conversationList.value.some((item) => item.id === id)) {
      attention.clear(id);
    }
    return success;
  }

  let sessionAlive = true;
  let undoArchive: {
    ids: string[];
    expiresAt: number;
    toastId: string | number;
  } | null = null;
  let undoArchiveTimer: ReturnType<typeof setTimeout> | undefined;
  function clearArchiveUndo() {
    clearTimeout(undoArchiveTimer);
    undoArchiveTimer = undefined;
    if (undoArchive) toast.dismiss(undoArchive.toastId);
    undoArchive = null;
  }
  async function restoreConversation(id: string) {
    if (undoArchive?.ids.includes(id)) {
      undoArchive.ids = undoArchive.ids.filter((item) => item !== id);
      if (!undoArchive.ids.length) clearArchiveUndo();
    }
    return conversation.setConversationStatus(id, 'Active');
  }
  function undoLastArchive() {
    if (!undoArchive || Date.now() >= undoArchive.expiresAt) {
      clearArchiveUndo();
      return;
    }
    const ids = [...undoArchive.ids];
    clearArchiveUndo();
    return Promise.all(ids.map(restoreConversation));
  }
  async function archiveConversation(id: string, recordUndo = true): Promise<boolean> {
    if (recordUndo && bulkBusy) return false;
    let state: ConversationAttentionStatus | undefined = durableAttention.statuses.value[id];
    try {
      const item = conversationList.value.find((entry) => entry.id === id);
      const fresh = await options.runtime.listAttention?.(
        [id],
        item?.runtimeKind === 'local_agent' ? 'local_agent' : 'builtin',
      );
      if (!sessionAlive) return false;
      state = fresh?.[0]?.state === 'normal' ? undefined : (fresh?.[0]?.state ?? state);
    } catch (error) {
      if (!sessionAlive) return false;
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.archiveFailed'));
      return false;
    }
    if (
      state === 'working' ||
      state === 'input' ||
      state === 'approval' ||
      (id === chatConversationId.value &&
        (chatLoading.value ||
          chatMessage.value.length ||
          composerAttachments.value.length ||
          composerContextEntities.value.some((item) => item.origin === 'explicit')))
    ) {
      toast.error(t('aiAssistant.dialogs.chat.archiveBlocked'));
      return false;
    }
    if (!(await conversation.setConversationStatus(id, 'Archived')) || !sessionAlive) return false;
    // The user may have typed or started a turn while persistence was in flight.
    if (
      id === chatConversationId.value &&
      !chatLoading.value &&
      !chatMessage.value.length &&
      !composerAttachments.value.length &&
      !composerContextEntities.value.some((item) => item.origin === 'explicit')
    )
      startNewConversation();
    if (recordUndo) recordArchiveUndo([id]);
    return true;
  }
  function recordArchiveUndo(ids: string[]) {
    clearArchiveUndo();
    if (!sessionAlive || !ids.length) return;
    const toastId = toast.success(t('aiAssistant.dialogs.chat.archived'), {
      duration: 5000,
      position: 'bottom-center',
      action: {
        label: t('aiAssistant.dialogs.chat.undoArchive'),
        onClick: () => {
          if (undoArchive?.toastId === toastId) void undoLastArchive();
        },
      },
    });
    undoArchive = { ids, expiresAt: Date.now() + 5000, toastId };
    undoArchiveTimer = setTimeout(clearArchiveUndo, 5000);
  }
  let bulkBusy = false;
  async function changeConversations(action: 'archive' | 'restore', ids: string[]) {
    if (bulkBusy) return [];
    bulkBusy = true;
    clearArchiveUndo();
    const results: { id: string; success: boolean }[] = [];
    try {
      for (const id of new Set(ids)) {
        if (!sessionAlive) break;
        results.push({
          id,
          success:
            action === 'archive'
              ? await archiveConversation(id, false)
              : await restoreConversation(id),
        });
      }
      if (action === 'archive')
        recordArchiveUndo(results.filter((item) => item.success).map((item) => item.id));
      return results;
    } finally {
      bulkBusy = false;
    }
  }
  function archiveConversations(ids: string[]) {
    return changeConversations('archive', ids);
  }
  function restoreConversations(ids: string[]) {
    return changeConversations('restore', ids);
  }
  function handleArchiveUndo(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      !(event.ctrlKey || event.metaKey) ||
      event.shiftKey ||
      event.altKey ||
      event.key.toLowerCase() !== 'z' ||
      !undoArchive ||
      Date.now() >= undoArchive.expiresAt
    )
      return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))
    )
      return;
    event.preventDefault();
    void undoLastArchive();
  }
  onMounted(() => window.addEventListener('keydown', handleArchiveUndo));
  onUnmounted(() => {
    sessionAlive = false;
    window.removeEventListener('keydown', handleArchiveUndo);
    clearArchiveUndo();
  });

  function buildConversationTranscript() {
    const transcript = chatTimeline.value
      .filter((item) => item.content.trim().length > 0)
      .map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content.trim()}`)
      .join('\n\n');
    if (!composerContextEntities.value.length) return transcript;
    const context = composerContextEntities.value
      .map((entity) => `- ${entity.entityType}: ${entity.label} (${entity.id})`)
      .join('\n');
    return `${transcript}\n\nSelected MemoFlow context:\n${context}`.trim();
  }

  async function prepareWorkflowTurn(
    loadService: AIChatService,
    conversationName: string,
    adjustComposerHeight: () => void,
  ): Promise<{ conversationId: string; content: string } | null> {
    if (chatLoading.value) return null;
    const pendingContent = chatMessage.value.trim();
    if (!pendingContent) return null;
    conversation.invalidateRuntimeHistory();
    chatLoading.value = true;
    try {
      const conversationId = await ensureConversationCreated(loadService, conversationName);
      markConversationActivity(conversationId);
      void loadConversationList(loadService);
      const pendingAttachments = composerAttachments.value.map((attachment) => ({
        mediaType: attachment.mediaType,
        ...(attachment.filename ? { filename: attachment.filename } : {}),
      }));
      chatTimeline.value.push({
        id: `workflow-user-draft-${Date.now()}`,
        role: 'user',
        content: pendingContent,
        ...(pendingAttachments.length ? { attachments: pendingAttachments } : {}),
        status: 'success',
      });
      chatMessage.value = '';
      clearComposerTurnState();
      await nextTick();
      adjustComposerHeight();
      return { conversationId, content: pendingContent };
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.sendFailed'));
      return null;
    } finally {
      chatLoading.value = false;
    }
  }

  function resetChatSession(mode: string = 'chat', getDefaultName: (m: string) => string) {
    chatConversationId.value = '';
    runtimeChoice.value =
      mode === 'chat'
        ? (options.getDefaultRuntimeChoice?.() ?? { runtimeKind: 'builtin' })
        : { runtimeKind: 'builtin' };
    historyIncomplete.value = false;
    chatTimeline.value = [];
    chatMessage.value = '';
    conversationTitle.value = getDefaultName(mode);
    activeRuntimeRunId.value = null;
    lastRuntimeUsage.value = null;
    clearComposerContext();
  }

  function startNewConversation(mode: string = 'chat') {
    abortActiveStream();
    resetChatSession(mode, options.getDefaultConversationName);
    clearLastActiveConversation();
  }

  function scrollMessagesToBottom(options?: { streaming?: boolean; force?: boolean }) {
    nextTick(() => {
      const viewport = messagesViewport.value;
      if (!viewport) return;
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (
        options?.streaming &&
        !options.force &&
        distanceFromBottom > STREAM_AUTO_FOLLOW_THRESHOLD_PX
      )
        return;
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: options?.streaming ? 'auto' : 'smooth',
      });
    });
  }

  return {
    runtimeChoice,
    historyIncomplete,
    respondNativeRequest: stream.respondNativeRequest,
    answerAskUser: stream.answerAskUser,
    cancelAskUser: stream.cancelAskUser,
    chatMessage,
    chatLoading,
    chatConversationId,
    chatTimeline,
    conversationTitle,
    conversationListLoading,
    conversationList,
    conversationProjectionLive,
    conversationStatuses: durableAttention.statuses,
    lastActiveConversationId,
    messagesViewport,
    composerTextarea,
    activeStreamAbortController,
    activeRuntimeRunId,
    lastRuntimeUsage,
    composerAttachments,
    composerContextEntities,
    hasWorkflowMessages,
    hasWorkflowUserMessages,
    abortActiveStream,
    stopGenerating,
    decideToolApproval,
    updateLastActiveConversation,
    clearLastActiveConversation,
    buildConversationTranscript,
    loadConversationList,
    syncConversationSummary,
    refreshRuntimeUsage,
    selectConversation: selectConversationWithAttention,
    deleteConversation: deleteConversationWithAttention,
    archiveConversation,
    renameConversation: conversation.renameConversation,
    generateConversationTitle: conversation.generateConversationTitle,
    titleBusy: conversation.titleBusy,
    archiveConversations,
    restoreConversations,
    restoreConversation,
    archivePage: conversation.archivePage,
    archiveHasMore: conversation.archiveHasMore,
    changeArchivePage: conversation.changeArchivePage,
    ensureConversationCreated,
    prepareWorkflowTurn,
    resetChatSession,
    startNewConversation,
    handleSendChat,
    scrollMessagesToBottom,
    normalizeChatItem,
    addComposerFiles,
    removeComposerAttachment,
    toggleExplicitContextEntity,
    setSurfaceContextEntity,
    removeContextEntity,
  };
}
