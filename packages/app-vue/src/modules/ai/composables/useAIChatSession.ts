import type {
  AssistantRuntimeClient,
  WorkflowRuntimeClient,
  RuntimeUsageClient,
  LocalAgentClient,
} from '@memoflow/ai/client';
import type { AIRuntimeSurface, AIChatPermissionMode } from '@memoflow/contracts/ai';
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { getAIErrorMessage } from './error';
import type { AIChatService } from './types';
import { useAIComposerContext } from './useAIComposerContext';
import { useAssistantStream } from './useAssistantStream';
import { useConversationProjection } from './useConversationProjection';
import { useConversationAttention } from './useConversationAttention';
import { useDurableConversationAttention } from './useDurableConversationAttention';

const STREAM_AUTO_FOLLOW_THRESHOLD_PX = 96;
export interface UseAIChatSessionOptions {
  /** Transitional shell/workflow client. Open-chat transcript execution never uses it. */
  service: AIChatService;
  localAgent?: LocalAgentClient;
  /** Refresh a native discovery snapshot once after an observed terminal result; never retry inference. */
  onNativeRunSettled?: (connectionId: string) => void;
  getPermissionMode?: () => AIChatPermissionMode;
  getNativeModelOptions?: () => import('@memoflow/contracts/ai').LocalAgentModelOptions | undefined;
  getDefaultRuntimeChoice?: () => import('@memoflow/contracts/ai').AssistantRuntimeChoice;
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
  const stream = useAssistantStream({ options, chatMessage, conversation, composer });
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
    await deleteConversation(...args);
    if (wasListed && !conversationList.value.some((item) => item.id === id)) {
      attention.clear(id);
    }
  }

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
