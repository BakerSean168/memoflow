import type {
  AssistantRuntimeEvent,
  AssistantRuntimeSelectedEntity,
  LocalAgentRequestResponse,
} from '@memoflow/contracts/ai';
import { nextTick, ref, shallowRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { getAIErrorMessage } from './error';
import type { AIChatService, ChatModelOption, ChatToolApproval, ChatNativeRequest } from './types';

import type { UseAIChatSessionOptions } from './useAIChatSession';
import type { useAIComposerContext } from './useAIComposerContext';
import type { useConversationProjection } from './useConversationProjection';
const STREAM_DELTA_FLUSH_MS = 48;
export function useAssistantStream(input: {
  options: UseAIChatSessionOptions;
  chatMessage: Ref<string>;
  conversation: Pick<
    ReturnType<typeof useConversationProjection>,
    | 'runtimeChoice'
    | 'chatConversationId'
    | 'chatTimeline'
    | 'lastRuntimeUsage'
    | 'ensureConversationCreated'
    | 'refreshRuntimeUsage'
  >;
  composer: ReturnType<typeof useAIComposerContext>;
}) {
  const { options, chatMessage, composer } = input;
  const {
    runtimeChoice,
    chatConversationId,
    chatTimeline,
    lastRuntimeUsage,
    ensureConversationCreated,
    refreshRuntimeUsage,
  } = input.conversation;
  const { composerAttachments, clearComposerTurnState } = composer;
  const { t } = useI18n();
  const chatLoading = ref(false);
  const activeStreamAbortController = shallowRef<AbortController | null>(null);
  const activeRuntimeRunId = ref<string | null>(null);
  let pendingStreamDelta = '';
  let pendingStreamAssistantId: string | null = null;
  let pendingStreamFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function isAbortLikeError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { name?: unknown; code?: unknown; category?: unknown };
    return (
      candidate.name === 'AbortError' ||
      candidate.code === 'ABORTED' ||
      candidate.code === 'CANCELED' ||
      candidate.category === 'aborted'
    );
  }

  function settleVisibleApprovals(
    resolution: 'cancelled' | 'failed',
    scope?: { conversationId?: string; assistantDraftId?: string },
  ) {
    if (scope?.conversationId && chatConversationId.value !== scope.conversationId) return;
    const items = scope?.assistantDraftId
      ? chatTimeline.value.filter((item) => item.id === scope.assistantDraftId)
      : chatTimeline.value;
    for (const item of items) {
      if (item.toolActivity) delete item.toolActivity;
      delete item.nativeActivity;
      for (const request of item.nativeRequests ?? [])
        if (request.status === 'pending' || request.status === 'sending')
          request.status = 'expired';
      for (const approval of item.approvals ?? []) {
        if (approval.status === 'pending' || approval.status === 'sending') {
          approval.status = resolution;
          approval.errorMessage = undefined;
        }
      }
    }
  }

  async function decideToolApproval(approval: ChatToolApproval, decision: 'approve' | 'decline') {
    if (
      approval.status !== 'pending' ||
      approval.runId !== activeRuntimeRunId.value ||
      approval.conversationId !== chatConversationId.value ||
      !chatLoading.value
    )
      return;
    approval.status = 'sending';
    approval.errorMessage = undefined;
    const stillWaiting = () =>
      approval.status === 'sending' &&
      approval.runId === activeRuntimeRunId.value &&
      approval.conversationId === chatConversationId.value &&
      chatLoading.value;
    try {
      const accepted = await options.runtime.decideToolApproval({
        type: 'tool_approval',
        conversationId: approval.conversationId,
        runId: approval.runId,
        toolCallId: approval.toolCallId,
        decision,
      });
      // The event stream, not an acknowledgement, owns resolution.
      if (!accepted && stillWaiting()) {
        approval.status = 'stale';
        approval.errorMessage = t('aiAssistant.chatPage.tools.stale');
      }
    } catch {
      if (stillWaiting()) {
        approval.status = 'pending';
        approval.errorMessage = t('aiAssistant.chatPage.tools.transportError');
      }
    }
  }

  async function respondNativeRequest(
    request: ChatNativeRequest,
    response: LocalAgentRequestResponse['response'],
  ) {
    if (
      request.status !== 'pending' ||
      request.runId !== activeRuntimeRunId.value ||
      request.conversationId !== chatConversationId.value ||
      !chatLoading.value ||
      !options.localAgent
    )
      return;
    request.status = 'sending';
    try {
      const accepted = await options.localAgent.respond({
        conversationId: request.conversationId,
        runId: request.runId,
        requestId: request.request.requestId,
        response,
      });
      if (!accepted && request.status === 'sending') request.status = 'expired';
    } catch {
      if (request.status === 'sending') {
        request.status = 'pending';
        request.errorMessage = t('aiAssistant.chatPage.tools.transportError');
      }
    }
  }

  function clearPendingStreamFlushTimer() {
    if (pendingStreamFlushTimer === null) return;
    clearTimeout(pendingStreamFlushTimer);
    pendingStreamFlushTimer = null;
  }

  function flushPendingStreamDelta(assistantDraftId?: string) {
    if (!pendingStreamDelta || !pendingStreamAssistantId) {
      clearPendingStreamFlushTimer();
      return;
    }
    if (assistantDraftId && pendingStreamAssistantId !== assistantDraftId) return;
    const target = chatTimeline.value.find((item) => item.id === pendingStreamAssistantId);
    if (target) {
      target.content += pendingStreamDelta;
      target.status = 'generating';
      target.errorMessage = undefined;
    }
    pendingStreamDelta = '';
    pendingStreamAssistantId = null;
    clearPendingStreamFlushTimer();
  }

  function bufferStreamDelta(assistantDraftId: string, content: string) {
    if (!content) return;
    if (pendingStreamAssistantId && pendingStreamAssistantId !== assistantDraftId) {
      flushPendingStreamDelta();
    }
    pendingStreamAssistantId = assistantDraftId;
    pendingStreamDelta += content;
    if (pendingStreamFlushTimer !== null) return;
    pendingStreamFlushTimer = setTimeout(() => {
      flushPendingStreamDelta(assistantDraftId);
    }, STREAM_DELTA_FLUSH_MS);
  }

  function abortActiveStream() {
    flushPendingStreamDelta();
    settleVisibleApprovals('cancelled');
    if (!activeStreamAbortController.value) return;
    activeStreamAbortController.value.abort();
    activeStreamAbortController.value = null;
    activeRuntimeRunId.value = null;
    chatLoading.value = false;
  }

  function markGeneratingAssistantAborted() {
    for (const item of chatTimeline.value) {
      if (item.role === 'assistant' && item.status === 'generating') {
        item.status = 'aborted';
        item.errorMessage = undefined;
      }
    }
  }

  /** Stop the local stream and best-effort cancel the authenticated Mastra run. */
  function stopGenerating() {
    if (!chatLoading.value) return;
    const runId = activeRuntimeRunId.value;
    abortActiveStream();
    markGeneratingAssistantAborted();
    if (!runId) return;
    const cancel =
      runtimeChoice.value.runtimeKind === 'local_agent'
        ? options.runtime.cancelRun(runId, 'local_agent')
        : options.runtime.cancelRun(runId);
    void cancel.catch(() => {
      // Transport abort is already applied locally; owner-scoped cancel is best effort.
    });
  }

  function applyRuntimeEvent(event: AssistantRuntimeEvent, assistantDraftId: string) {
    if (event.conversationId !== chatConversationId.value) return;
    if (activeRuntimeRunId.value && event.runId !== activeRuntimeRunId.value) return;
    const item = chatTimeline.value.find((candidate) => candidate.id === assistantDraftId);
    if (!item) return;
    if (event.type === 'assistant.request.required') {
      item.nativeRequests ??= [];
      if (!item.nativeRequests.some((value) => value.request.requestId === event.data.requestId))
        item.nativeRequests.push({
          request: event.data,
          conversationId: event.conversationId,
          runId: event.runId,
          status: 'pending',
        });
      return;
    }
    if (event.type === 'assistant.request.resolved') {
      const request = item.nativeRequests?.find(
        (value) => value.request.requestId === event.data.requestId,
      );
      if (request) request.status = event.data.resolution === 'answered' ? 'answered' : 'expired';
      return;
    }
    if (event.type === 'assistant.activity') {
      if (event.data.activityType === 'native_tool') {
        const activity = event.data;
        item.nativeActivities ??= [];
        const existing = item.nativeActivities.findIndex(
          (value) => value.toolCallId === activity.toolCallId,
        );
        if (existing >= 0) item.nativeActivities[existing] = activity;
        else if (item.nativeActivities.length < 256) item.nativeActivities.push(activity);
        if (event.data.state === 'running') item.nativeActivity = event.data;
        else if (item.nativeActivity?.toolCallId === event.data.toolCallId)
          delete item.nativeActivity;
      }
      if (event.data.activityType === 'tool') {
        if (event.data.state === 'running') item.toolActivity = event.data;
        else if (item.toolActivity?.toolCallId === event.data.toolCallId) delete item.toolActivity;
      }
      return;
    }
    if (event.type === 'assistant.approval.required') {
      if (item.toolActivity) delete item.toolActivity;
      item.approvals ??= [];
      if (!item.approvals.some((approval) => approval.toolCallId === event.data.toolCallId))
        item.approvals.push({
          ...event.data,
          conversationId: event.conversationId,
          runId: event.runId,
          status: 'pending',
        });
      return;
    }
    if (event.type === 'assistant.approval.resolved') {
      const approval = item.approvals?.find(
        (candidate) => candidate.toolCallId === event.data.toolCallId,
      );
      if (approval) {
        approval.status = event.data.resolution;
        approval.errorMessage = undefined;
      }
      return;
    }
    if (
      event.type === 'assistant.run.completed' ||
      event.type === 'assistant.run.failed' ||
      event.type === 'assistant.run.cancelled'
    ) {
      flushPendingStreamDelta(assistantDraftId);
      settleVisibleApprovals(event.type === 'assistant.run.cancelled' ? 'cancelled' : 'failed', {
        conversationId: event.conversationId,
        assistantDraftId,
      });
    }
    if (event.type === 'assistant.run.started') {
      activeRuntimeRunId.value = event.runId;
      if (
        runtimeChoice.value.runtimeKind === 'local_agent' &&
        event.data.modelId &&
        event.data.providerId
      )
        item.localAgentSource = {
          connectionId: event.data.providerId,
          modelId: event.data.modelId,
          runId: event.runId,
        };
      return;
    }
    if (event.type === 'assistant.message.delta') {
      bufferStreamDelta(assistantDraftId, event.data.content);
      return;
    }
    if (event.type === 'assistant.usage.updated') {
      lastRuntimeUsage.value = event.data;
      return;
    }
    if (event.type === 'assistant.run.completed') {
      const target = chatTimeline.value.find((item) => item.id === assistantDraftId);
      if (target) {
        target.id = event.data.assistantMessageId || target.id;
        target.content = event.data.content || target.content;
        target.status = 'success';
        target.errorMessage = undefined;
      }
      return;
    }
    if (event.type === 'assistant.run.cancelled') {
      markGeneratingAssistantAborted();
      return;
    }
    if (event.type === 'assistant.run.failed') {
      const target = chatTimeline.value.find((item) => item.id === assistantDraftId);
      if (target) {
        target.status = 'error';
        target.errorMessage = event.data.message;
      }
    }
  }

  async function handleSendChat(
    loadService: AIChatService,
    selectedModel: ChatModelOption | null,
    conversationName: string,
    adjustComposerHeight: () => void,
  ) {
    const choice = runtimeChoice.value;
    if ((choice.runtimeKind === 'builtin' && !selectedModel) || chatLoading.value) return;

    let userDraftId = '';
    let assistantDraftId = '';
    let streamController: AbortController | null = null;
    let conversationId = '';

    try {
      const pendingAttachments = composerAttachments.value.map((attachment) => ({
        data: attachment.data,
        mediaType: attachment.mediaType,
        ...(attachment.filename ? { filename: attachment.filename } : {}),
      }));
      const pendingEntities: AssistantRuntimeSelectedEntity[] = composer.selectedEntities();
      const pendingUserMessage = chatMessage.value.trim();
      if (!pendingUserMessage && pendingAttachments.length === 0) return;

      chatLoading.value = true;
      streamController = new AbortController();
      activeStreamAbortController.value = streamController;
      activeRuntimeRunId.value = null;
      conversationId = await ensureConversationCreated(
        loadService,
        conversationName,
        streamController.signal,
      );
      streamController.signal.throwIfAborted();
      lastRuntimeUsage.value = null;

      userDraftId = `user-draft-${Date.now()}`;
      assistantDraftId = `assistant-draft-${Date.now()}`;
      chatTimeline.value.push(
        {
          id: userDraftId,
          role: 'user',
          content: pendingUserMessage,
          ...(pendingAttachments.length
            ? {
                attachments: pendingAttachments.map((attachment) => ({
                  mediaType: attachment.mediaType,
                  ...(attachment.filename ? { filename: attachment.filename } : {}),
                })),
              }
            : {}),
          status: 'success',
        },
        { id: assistantDraftId, role: 'assistant', content: '', status: 'generating' },
      );
      chatMessage.value = '';
      clearComposerTurnState();
      await nextTick();
      adjustComposerHeight();

      await options.runtime.streamMessage(
        {
          type: 'message',
          conversationId,
          content: pendingUserMessage,
          surface: options.surface,
          ...(choice.runtimeKind === 'local_agent'
            ? { runtimeKind: 'local_agent', modelId: choice.modelId }
            : { providerId: selectedModel!.providerId, modelId: selectedModel!.modelId }),
          attachments: pendingAttachments,
          selectedEntities: pendingEntities,
        },
        {
          onEvent: (event) => {
            if (
              activeStreamAbortController.value === streamController &&
              !streamController?.signal.aborted
            )
              applyRuntimeEvent(event, assistantDraftId);
          },
        },
        streamController.signal,
      );

      // Retain the live turn: persisted history may still lag behind the stream.
      // Explicit conversation reload/reselect remains authoritative.
      await refreshRuntimeUsage(conversationId);
    } catch (error) {
      flushPendingStreamDelta(assistantDraftId);
      const assistantDraft = chatTimeline.value.find((item) => item.id === assistantDraftId);
      const userDraft = chatTimeline.value.find((item) => item.id === userDraftId);
      if (streamController?.signal.aborted || isAbortLikeError(error)) {
        if (assistantDraft) {
          assistantDraft.status = 'aborted';
          assistantDraft.errorMessage = undefined;
        }
        if (userDraft) userDraft.status = 'success';
      } else {
        const errorMessage = getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.sendFailed');
        if (assistantDraft) {
          assistantDraft.status = 'error';
          assistantDraft.errorMessage = errorMessage;
        }
        if (userDraft) userDraft.status = 'success';
        toast.error(errorMessage);
      }
    } finally {
      if (assistantDraftId) flushPendingStreamDelta(assistantDraftId);
      if (assistantDraftId)
        settleVisibleApprovals(streamController?.signal.aborted ? 'cancelled' : 'failed', {
          conversationId,
          assistantDraftId,
        });
      if (activeStreamAbortController.value === streamController) {
        activeStreamAbortController.value = null;
        activeRuntimeRunId.value = null;
        chatLoading.value = false;
      }
    }
  }

  return {
    respondNativeRequest,
    chatLoading,
    activeStreamAbortController,
    activeRuntimeRunId,
    abortActiveStream,
    stopGenerating,
    decideToolApproval,
    handleSendChat,
  };
}
