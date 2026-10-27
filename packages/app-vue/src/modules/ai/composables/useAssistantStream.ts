import { extractStructuredResultError } from '@memoflow/contracts/result';
import type {
  AssistantRuntimeEvent,
  AssistantRuntimeSelectedEntity,
  LocalAgentRequestResponse,
} from '@memoflow/ai-contracts';
import { nextTick, ref, shallowRef, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { getAIErrorMessage } from './error';
import type {
  AIChatService,
  ChatModelOption,
  ChatToolApproval,
  ChatNativeRequest,
  ChatAskUserRequest,
  ChatAskUserAnswer,
} from './types';

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
    | 'refreshRuntimeHistory'
    | 'invalidateRuntimeHistory'
    | 'markConversationActivity'
    | 'loadConversationList'
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
    refreshRuntimeHistory,
    invalidateRuntimeHistory,
    markConversationActivity,
    loadConversationList,
  } = input.conversation;
  const { composerAttachments, clearComposerTurnState } = composer;
  const { t } = useI18n();
  const chatLoading = ref(false);
  const activeStreamAbortController = shallowRef<AbortController | null>(null);
  const activeRuntimeRunId = ref<string | null>(null);
  let pendingStreamDelta = '';
  let pendingStreamAssistantId: string | null = null;
  let pendingStreamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  // A live `ask_user` suspension ends the stream turn while the question stays
  // answerable. Remember which run is parked so the composer release neither
  // expires the pending question nor blocks the answer/cancel command.
  const suspendedAskUserRunId = shallowRef<string | null>(null);
  let deferredApprovalHistory: string | null = null;

  function refreshDeferredApprovalHistory() {
    if (!deferredApprovalHistory) return;
    const conversationId = deferredApprovalHistory;
    deferredApprovalHistory = null;
    void reconcileAskUserHistory(conversationId);
  }

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
        if (approval.parked) continue;
        if (approval.status === 'pending' || approval.status === 'sending') {
          approval.status = resolution;
          approval.errorMessage = undefined;
        }
      }
      for (const request of item.askUserRequests ?? []) {
        // A parked ask_user question stays pending until it is answered or cancelled.
        if (request.runId === suspendedAskUserRunId.value) continue;
        if (request.status === 'pending' || request.status === 'sending')
          request.status = 'expired';
      }
    }
  }

  async function decideToolApproval(approval: ChatToolApproval, decision: 'approve' | 'decline') {
    if (
      approval.status !== 'pending' ||
      (!approval.parked && approval.runId !== activeRuntimeRunId.value) ||
      approval.conversationId !== chatConversationId.value ||
      (!approval.parked && !chatLoading.value) ||
      (approval.parked &&
        (!chatTimeline.value.some((item) => item.approvals?.includes(approval)) ||
          chatLoading.value))
    )
      return;
    approval.status = 'sending';
    approval.errorMessage = undefined;
    const stillWaiting = () =>
      approval.status === 'sending' &&
      (approval.parked || approval.runId === activeRuntimeRunId.value) &&
      approval.conversationId === chatConversationId.value &&
      (approval.parked
        ? chatTimeline.value.some((item) => item.approvals?.includes(approval))
        : chatLoading.value);
    try {
      const accepted = await options.runtime.decideToolApproval({
        type: 'tool_approval',
        conversationId: approval.conversationId,
        runId: approval.runId,
        toolCallId: approval.toolCallId,
        decision,
      });
      if (accepted && approval.parked && stillWaiting()) {
        approval.status = decision === 'approve' ? 'approved' : 'declined';
        if (chatLoading.value) deferredApprovalHistory = approval.conversationId;
        else await reconcileAskUserHistory(approval.conversationId);
      }
      // Live decisions are resolved by the event stream.
      if (!accepted && stillWaiting()) {
        approval.status = 'stale';
        approval.errorMessage = t('aiAssistant.chatPage.tools.stale');
      }
    } catch {
      if (stillWaiting()) {
        approval.status = 'unknown';
        approval.errorMessage = t('aiAssistant.chatPage.tools.decisionUnknown');
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

  /** Never trust a retained card from a different conversation or stale projection. */
  function isVisibleAskUserRequest(request: ChatAskUserRequest): boolean {
    return (
      request.conversationId === chatConversationId.value &&
      chatTimeline.value.some((item) => item.askUserRequests?.includes(request)) &&
      (!chatLoading.value || activeRuntimeRunId.value === request.runId)
    );
  }

  async function reconcileAskUserHistory(conversationId: string) {
    if (conversationId !== chatConversationId.value) return;
    try {
      await refreshRuntimeHistory(conversationId, { preserveAcceptedDecision: true });
    } catch {
      // The server already accepted the answer; a history read failure must not
      // re-enable the answered card and permit duplicate resume requests.
      toast.error(t('aiAssistant.dialogs.chat.loadFailed'));
    }
  }

  async function answerAskUser(request: ChatAskUserRequest, answer: ChatAskUserAnswer) {
    if (request.status !== 'pending' || !isVisibleAskUserRequest(request)) return;
    request.status = 'sending';
    request.errorMessage = undefined;
    try {
      const accepted = await options.runtime.answerToolSuspension({
        type: 'tool_answer',
        action: 'answer',
        conversationId: request.conversationId,
        runId: request.runId,
        toolCallId: request.toolCallId,
        answer,
      });
      if (!isVisibleAskUserRequest(request) || request.status !== 'sending') return;
      if (!accepted) {
        request.status = 'expired';
        request.errorMessage = t('aiAssistant.chatPage.tools.stale');
        return;
      }
      request.status = 'answered';
      if (suspendedAskUserRunId.value === request.runId) suspendedAskUserRunId.value = null;
      await reconcileAskUserHistory(request.conversationId);
    } catch {
      if (isVisibleAskUserRequest(request) && request.status === 'sending') {
        request.status = 'pending';
        request.errorMessage = t('aiAssistant.chatPage.tools.transportError');
      }
    }
  }

  async function cancelAskUser(request: ChatAskUserRequest) {
    if (request.status !== 'pending' || !isVisibleAskUserRequest(request)) return;
    request.status = 'sending';
    request.errorMessage = undefined;
    try {
      const accepted = await options.runtime.answerToolSuspension({
        type: 'tool_answer',
        action: 'cancel',
        conversationId: request.conversationId,
        runId: request.runId,
        toolCallId: request.toolCallId,
        answer: 'cancelled',
      });
      if (!isVisibleAskUserRequest(request) || request.status !== 'sending') return;
      request.status = 'expired';
      if (!accepted) {
        request.errorMessage = t('aiAssistant.chatPage.tools.stale');
        return;
      }
      if (suspendedAskUserRunId.value === request.runId) suspendedAskUserRunId.value = null;
      await reconcileAskUserHistory(request.conversationId);
    } catch {
      if (isVisibleAskUserRequest(request) && request.status === 'sending') {
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
    invalidateRuntimeHistory();
    flushPendingStreamDelta();
    settleVisibleApprovals('cancelled');
    if (!activeStreamAbortController.value) return;
    activeStreamAbortController.value.abort();
    activeStreamAbortController.value = null;
    activeRuntimeRunId.value = null;
    chatLoading.value = false;
    refreshDeferredApprovalHistory();
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
    if (event.type === 'assistant.run.started' && event.runId && chatConversationId.value) {
      void (async () => {
        try {
          const pending = await options.runtime.listAskUserSuspensions(chatConversationId.value);
          for (const suspended of pending) {
            if (suspended.runId !== event.runId || suspended.approval) continue;
            item.askUserRequests ??= [];
            if (
              !item.askUserRequests.some((request) => request.toolCallId === suspended.toolCallId)
            )
              item.askUserRequests.push({
                ...suspended,
                conversationId: event.conversationId,
                status: 'pending',
              });
          }
        } catch {
          /* A failed projection must not break the live turn stream. */
        }
      })();
    }
    if (event.type === 'assistant.ask_user.required') {
      item.askUserRequests ??= [];
      if (!item.askUserRequests.some((request) => request.toolCallId === event.data.toolCallId))
        item.askUserRequests.push({
          ...event.data,
          conversationId: event.conversationId,
          runId: event.runId,
          status: 'pending',
        });
      else {
        const existing = item.askUserRequests.find(
          (request) => request.toolCallId === event.data.toolCallId,
        )!;
        if (existing.status === 'expired') existing.status = 'pending';
      }
      // Park the run so the eventual composer release neither expires the question
      // nor blocks the answer/cancel command.
      suspendedAskUserRunId.value = event.runId;
      return;
    }
    if (event.type === 'assistant.ask_user.resolved') {
      const request = item.askUserRequests?.find(
        (candidate) => candidate.toolCallId === event.data.toolCallId,
      );
      if (request) request.status = event.data.resolution === 'answered' ? 'answered' : 'expired';
      if (suspendedAskUserRunId.value === event.runId) suspendedAskUserRunId.value = null;
      return;
    }
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
        const { toolCallId, toolName, state } = event.data;
        item.toolActivities ??= [];
        const existing = item.toolActivities.findIndex((call) => call.toolCallId === toolCallId);
        const activity = { toolCallId, toolName, state };
        if (existing >= 0) item.toolActivities[existing] = activity;
        else if (item.toolActivities.length < 256) item.toolActivities.push(activity);
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
        target.errorMessage = getAIErrorMessage(
          event.data,
          t,
          'aiAssistant.dialogs.chat.sendFailed',
        );
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
    // A suspended ask_user turn must be resolved before another message can
    // mutate the same conversation. Avoid overlapping native Agent runs.
    if (
      chatTimeline.value.some((item) =>
        item.askUserRequests?.some(
          (request) =>
            request.conversationId === chatConversationId.value &&
            (request.status === 'pending' || request.status === 'sending'),
        ),
      )
    )
      return;

    let userDraftId = '';
    let assistantDraftId = '';
    let streamController: AbortController | null = null;
    let conversationId = '';
    const originalDraft = chatMessage.value;
    let draftEdited = false;
    let draftConsumed = false;
    let stopWatchingDraft: (() => void) | undefined;
    let nativeLimitCode: string | undefined;
    let notified = false;
    const isCurrentNativeTurn = () =>
      choice.runtimeKind === 'local_agent' &&
      runtimeChoice.value.runtimeKind === 'local_agent' &&
      runtimeChoice.value.connectionId === choice.connectionId &&
      runtimeChoice.value.modelId === choice.modelId &&
      chatConversationId.value === conversationId &&
      activeStreamAbortController.value === streamController &&
      !streamController?.signal.aborted;
    const notifyNativeSettled = () => {
      if (!notified && isCurrentNativeTurn() && choice.runtimeKind === 'local_agent') {
        notified = true;
        options.onNativeRunSettled?.(choice.connectionId);
      }
    };
    const restoreLimitedDraft = () => {
      const assistant = chatTimeline.value.find((item) => item.id === assistantDraftId);
      if (
        isCurrentNativeTurn() &&
        draftConsumed &&
        !draftEdited &&
        !chatMessage.value &&
        !assistant?.content &&
        (nativeLimitCode === 'LOCAL_AGENT_RATE_LIMITED' ||
          nativeLimitCode === 'LOCAL_AGENT_QUOTA_EXHAUSTED')
      )
        chatMessage.value = originalDraft;
    };
    const permissionMode = options.getPermissionMode?.() ?? 'supervised';
    const nativeModelOptions =
      choice.runtimeKind === 'local_agent' ? options.getNativeModelOptions?.() : undefined;

    try {
      const pendingAttachments = composerAttachments.value.map((attachment) => ({
        data: attachment.data,
        mediaType: attachment.mediaType,
        ...(attachment.filename ? { filename: attachment.filename } : {}),
      }));
      const pendingEntities: AssistantRuntimeSelectedEntity[] = composer.selectedEntities();
      const pendingUserMessage = chatMessage.value.trim();
      if (!pendingUserMessage && pendingAttachments.length === 0) return;

      invalidateRuntimeHistory();
      chatLoading.value = true;
      stopWatchingDraft = watch(
        chatMessage,
        () => {
          draftEdited = true;
        },
        { flush: 'sync' },
      );
      streamController = new AbortController();
      activeStreamAbortController.value = streamController;
      activeRuntimeRunId.value = null;
      conversationId = await ensureConversationCreated(
        loadService,
        conversationName,
        streamController.signal,
      );
      streamController.signal.throwIfAborted();
      markConversationActivity(conversationId);
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
      if (!draftEdited) {
        chatMessage.value = '';
        draftEdited = false; // The synchronous watch observed our own consumption.
        draftConsumed = true;
        clearComposerTurnState();
      }
      await nextTick();
      adjustComposerHeight();

      await options.runtime.streamMessage(
        {
          type: 'message',
          conversationId,
          content: pendingUserMessage,
          surface: options.surface,
          permissionMode,
          ...(choice.runtimeKind === 'local_agent'
            ? {
                runtimeKind: 'local_agent',
                modelId: choice.modelId,
                ...(nativeModelOptions ? { nativeModelOptions } : {}),
              }
            : {
                providerId: selectedModel!.providerId,
                modelId: selectedModel!.modelId,
                ...(selectedModel!.agentInstanceId
                  ? { agentInstanceId: selectedModel!.agentInstanceId }
                  : {}),
              }),
          attachments: pendingAttachments,
          selectedEntities: pendingEntities,
        },
        {
          onEvent: (event) => {
            if (
              activeStreamAbortController.value === streamController &&
              !streamController?.signal.aborted
            ) {
              applyRuntimeEvent(event, assistantDraftId);
              if (event.type === 'assistant.run.failed') nativeLimitCode = event.data.code;
              if (
                event.type === 'assistant.run.failed' ||
                event.type === 'assistant.run.completed' ||
                event.type === 'assistant.run.cancelled'
              )
                notifyNativeSettled();
            }
          },
        },
        streamController.signal,
      );

      restoreLimitedDraft();

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
        nativeLimitCode = extractStructuredResultError(error)?.code;
        restoreLimitedDraft();
        notifyNativeSettled();
        const errorMessage = getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.sendFailed');
        if (assistantDraft) {
          assistantDraft.status = 'error';
          assistantDraft.errorMessage = errorMessage;
        }
        if (userDraft) userDraft.status = 'success';
        toast.error(errorMessage);
      }
    } finally {
      stopWatchingDraft?.();
      if (conversationId) void loadConversationList(loadService);
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
        refreshDeferredApprovalHistory();
      }
    }
  }

  return {
    respondNativeRequest,
    answerAskUser,
    cancelAskUser,
    chatLoading,
    activeStreamAbortController,
    activeRuntimeRunId,
    abortActiveStream,
    stopGenerating,
    decideToolApproval,
    handleSendChat,
  };
}
