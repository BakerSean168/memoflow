import type {
  AssistantRuntimeClient,
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

const STREAM_AUTO_FOLLOW_THRESHOLD_PX = 96;
export interface UseAIChatSessionOptions {
  /** Transitional shell/workflow client. Open-chat transcript execution never uses it. */
  service: AIChatService;
  localAgent?: LocalAgentClient;
  getPermissionMode?: () => AIChatPermissionMode;
  getDefaultRuntimeChoice?: () => import('@memoflow/contracts/ai').AssistantRuntimeChoice;
  /** Mastra-native authoritative history/stream/cancel client. */
  runtime: AssistantRuntimeClient;
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
    lastActiveConversationId,
    lastRuntimeUsage,
    hasWorkflowMessages,
    hasWorkflowUserMessages,
    updateLastActiveConversation,
    clearLastActiveConversation,
    loadConversationList,
    refreshRuntimeUsage,
    selectConversation,
    deleteConversation,
    ensureConversationCreated,
    normalizeChatItem,
  } = conversation;
  const stream = useAssistantStream({ options, chatMessage, conversation, composer });
  const {
    chatLoading,
    activeStreamAbortController,
    activeRuntimeRunId,
    abortActiveStream,
    stopGenerating,
    decideToolApproval,
    handleSendChat,
  } = stream;

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
    try {
      const conversationId = await ensureConversationCreated(loadService, conversationName);
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
    chatMessage,
    chatLoading,
    chatConversationId,
    chatTimeline,
    conversationTitle,
    conversationListLoading,
    conversationList,
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
    refreshRuntimeUsage,
    selectConversation,
    deleteConversation,
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
