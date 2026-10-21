import {
  LocalAgentActivitySchema,
  AssistantRuntimeMessageViewSchema,
  type AIRuntimeUsage,
  type AssistantRuntimeChoice,
} from '@memoflow/contracts/ai';
import { unwrap } from '@memoflow/contracts/result';
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import {
  resetWorkspaceEvents,
  subscribeWorkspaceEvents,
} from '../../../shared/services/workspace-event-subscription';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { getAIErrorMessage } from './error';
import type { AIChatService, ChatItem, ConversationSummary } from './types';

import type { UseAIChatSessionOptions } from './useAIChatSession';
const LAST_CONVERSATION_STORAGE_KEY = 'ai:last-conversation-id';
const LIST_LIMIT = 24;
const MAX_TRACKED_CONVERSATIONS = 512;
type DeleteConversationId = Parameters<AIChatService['deleteConversation']>[0];
export function useConversationProjection(input: {
  options: UseAIChatSessionOptions;
  abortActiveStream: () => void;
  clearComposerContext: () => void;
  startNewConversation: () => void;
}) {
  const { options, abortActiveStream, clearComposerContext, startNewConversation } = input;
  const { t } = useI18n();
  const chatConversationId = ref('');
  const runtimeChoice = ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' });
  const historyIncomplete = ref(false);
  let historyGeneration = 0;
  let selectionGeneration = 0;
  function invalidateRuntimeHistory() {
    historyGeneration++;
    selectionGeneration++;
  }
  // Identity alone cannot reject an old A -> B -> A response.
  watch([chatConversationId, runtimeChoice], invalidateRuntimeHistory, { flush: 'sync' });
  const chatTimeline = ref<ChatItem[]>([]);
  const conversationTitle = ref('');
  const conversationListLoading = ref(false);
  const conversationList = ref<ConversationSummary[]>([]);
  /**
   * True once a snapshot started after the live stream watermark (stream.ready
   * or reset) has been applied. Deltas after this point are folded in without
   * list refetches; it is the observable "projection is live" boundary.
   */
  const conversationProjectionLive = ref(false);
  let listGeneration = 0;
  let mutationRevision = 0;
  const versions = new Map<string, number>();
  const streamController = new AbortController();
  let listRequest: Promise<boolean> | null = null;
  const pendingListChanges = new Map<
    string,
    {
      revision: number;
      resourceVersion?: number;
      item: ConversationSummary | null;
      runtimeKind: 'builtin' | 'local_agent';
    }
  >();

  function sortConversations(items: ConversationSummary[]): ConversationSummary[] {
    return items
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
      .slice(0, LIST_LIMIT);
  }

  function upsertConversation(item: ConversationSummary): void {
    if (item.runtimeKind !== 'local_agent') {
      const version = item.resourceVersion;
      if (version !== undefined && version < (versions.get(item.id) ?? 0)) return;
      const pending = pendingListChanges.get(item.id);
      if (pending?.item === null && (version ?? 0) <= (versions.get(item.id) ?? 0)) return;
      if (version !== undefined) versions.set(item.id, version);
    }
    pendingListChanges.set(item.id, {
      revision: ++mutationRevision,
      item,
      resourceVersion: item.runtimeKind === 'local_agent' ? undefined : item.resourceVersion,
      runtimeKind: item.runtimeKind ?? 'builtin',
    });
    conversationList.value = sortConversations([
      ...conversationList.value.filter((current) => current.id !== item.id),
      item,
    ]);
  }

  function markConversationActivity(id: string): void {
    const item = conversationList.value.find((current) => current.id === id);
    if (item)
      conversationList.value = sortConversations(
        conversationList.value.map((current) =>
          current.id === id
            ? { ...current, updatedAt: Math.max(Number(current.updatedAt ?? 0), Date.now()) }
            : current,
        ),
      );
  }

  onMounted(() => {
    if (!options.workspaceRuntime?.streamWorkspaceEvents) return;
    void subscribeWorkspaceEvents(options.workspaceRuntime, {
      signal: streamController.signal,
      onEvent: async (event) => {
        if (streamController.signal.aborted) return;
        if (event.type === 'stream.reset_required') {
          conversationProjectionLive.value = false;
          versions.clear();
          // Pending native mutations survive reset; drop ordering metadata from the old epoch.
          for (const change of pendingListChanges.values()) {
            change.resourceVersion = undefined;
            if (change.item && change.item.runtimeKind !== 'local_agent')
              change.item = { ...change.item, resourceVersion: undefined };
          }
          conversationList.value = conversationList.value.map((item) =>
            item.runtimeKind === 'local_agent' ? item : { ...item, resourceVersion: undefined },
          );
          await loadConversationList(options.service, true, mutationRevision);
          conversationProjectionLive.value = true;
        } else if (event.type === 'stream.ready') {
          conversationProjectionLive.value = false;
          // A discovery request may have read before the stream watermark.
          // Only a snapshot started after ready closes that initial race.
          if (listRequest) await listRequest;
          const beforeCalibration = mutationRevision;
          // Every reconnect snapshot is authoritative for completed mutations
          // before it, including resets requested by a different consumer.
          await loadConversationList(options.service, true, beforeCalibration);
          // Completed mutations now belong to this post-watermark snapshot.
          for (const [id, change] of pendingListChanges) {
            if (change.revision <= beforeCalibration) pendingListChanges.delete(id);
          }
          versions.clear();
          for (const item of conversationList.value) {
            if (item.runtimeKind !== 'local_agent' && item.resourceVersion !== undefined)
              versions.set(item.id, item.resourceVersion);
          }
          conversationProjectionLive.value = true;
        } else if (event.type === 'conversation.updated') {
          const id = event.data.conversationId;
          if (!versions.has(id) && versions.size >= MAX_TRACKED_CONVERSATIONS) {
            resetWorkspaceEvents(options.workspaceRuntime!);
            return;
          }
          if (event.resourceVersion <= (versions.get(id) ?? 0)) return;
          if (event.data.conversation) {
            upsertConversation(event.data.conversation);
            if (chatConversationId.value === id)
              conversationTitle.value = event.data.conversation.name;
          } else {
            versions.set(id, event.resourceVersion);
            pendingListChanges.set(id, {
              revision: ++mutationRevision,
              resourceVersion: event.resourceVersion,
              item: null,
              runtimeKind: 'builtin',
            });
            conversationList.value = conversationList.value.filter((item) => item.id !== id);
            if (chatConversationId.value === id) startNewConversation();
            if (lastActiveConversationId.value === id) clearLastActiveConversation();
          }
        }
      },
    }).catch(() => {
      /* Explicit refresh remains available after transport or projection loss. */
    });
  });
  onUnmounted(() => {
    streamController.abort();
    listGeneration++;
    invalidateRuntimeHistory();
  });

  const lastActiveConversationId = ref('');
  const lastRuntimeUsage = ref<AIRuntimeUsage | null>(null);
  const hasWorkflowMessages = computed(() =>
    chatTimeline.value.some((item) => item.content.trim().length > 0),
  );
  const hasWorkflowUserMessages = computed(() =>
    chatTimeline.value.some((item) => item.role === 'user' && item.content.trim().length > 0),
  );

  function normalizeChatRole(role: unknown): ChatItem['role'] {
    if (role === 'user' || role === 'User') return 'user';
    return 'assistant';
  }

  function normalizeChatItem(
    item: {
      id?: unknown;
      role?: unknown;
      content?: unknown;
      attachments?: unknown;
      nativeActivities?: unknown;
      toolActivities?: unknown;
      approvalReceipt?: unknown;
      runOutcome?: unknown;
      localAgentSource?: unknown;
    },
    index: number,
  ): ChatItem {
    const attachments = Array.isArray(item.attachments)
      ? item.attachments.flatMap((attachment) => {
          if (!attachment || typeof attachment !== 'object') return [];
          const candidate = attachment as { mediaType?: unknown; filename?: unknown };
          if (typeof candidate.mediaType !== 'string' || !candidate.mediaType.trim()) return [];
          return [
            {
              mediaType: candidate.mediaType,
              ...(typeof candidate.filename === 'string' && candidate.filename.trim()
                ? { filename: candidate.filename }
                : {}),
            },
          ];
        })
      : [];
    const approvalReceipt = AssistantRuntimeMessageViewSchema.shape.approvalReceipt.safeParse(
      item.approvalReceipt,
    ).data;
    const runOutcome = AssistantRuntimeMessageViewSchema.shape.runOutcome.safeParse(
      item.runOutcome,
    ).data;
    const toolActivities = AssistantRuntimeMessageViewSchema.shape.toolActivities.safeParse(
      item.toolActivities,
    ).data;
    return {
      id: item.id ? String(item.id) : `message-${index}`,
      role: normalizeChatRole(item.role),
      content: typeof item.content === 'string' ? item.content : '',
      ...(attachments.length ? { attachments } : {}),
      nativeActivities: LocalAgentActivitySchema.array().max(256).safeParse(item.nativeActivities)
        .data,
      localAgentSource: AssistantRuntimeMessageViewSchema.shape.localAgentSource.safeParse(
        item.localAgentSource,
      ).data,
      toolActivities,
      ...(approvalReceipt
        ? {
            approvals: [
              {
                ...approvalReceipt,
                conversationId: chatConversationId.value,
                status:
                  approvalReceipt.decision === 'approve'
                    ? ('approved' as const)
                    : ('declined' as const),
              },
            ],
          }
        : {}),
      ...(runOutcome
        ? {
            errorMessage: t(
              `aiAssistant.chatPage.tools.run${runOutcome.status === 'failed' ? 'Failed' : 'Cancelled'}`,
            ),
          }
        : {}),
      status:
        runOutcome?.status === 'cancelled'
          ? 'aborted'
          : runOutcome?.status === 'failed' ||
              toolActivities?.some((call) => call.state === 'failed')
            ? 'error'
            : 'success',
    };
  }

  function updateLastActiveConversation(id: string) {
    lastActiveConversationId.value = id;
    localStorage.setItem(LAST_CONVERSATION_STORAGE_KEY, id);
  }

  function clearLastActiveConversation() {
    lastActiveConversationId.value = '';
    localStorage.removeItem(LAST_CONVERSATION_STORAGE_KEY);
  }

  async function loadConversationList(
    loadService: AIChatService,
    required = false,
    compactRevision?: number,
  ): Promise<void> {
    const request = listRequest ?? performLoadConversationList(loadService, compactRevision);
    listRequest = request;
    const success = await request;
    if (listRequest === request) listRequest = null;
    if (required && !success) throw new Error('Conversation snapshot unavailable');
  }

  async function performLoadConversationList(loadService: AIChatService, compactRevision?: number) {
    const generation = ++listGeneration;
    const revision = mutationRevision;
    conversationListLoading.value = true;
    try {
      const [builtin, local] = await Promise.allSettled([
        loadService.listConversations({ page: 1, pageSize: LIST_LIMIT }).then(unwrap),
        options.localAgent?.listConversations() ?? Promise.resolve([]),
      ]);
      if (generation !== listGeneration) return false;
      const merged = new Map<string, ConversationSummary>(
        [
          ...(builtin.status === 'fulfilled'
            ? (builtin.value.data ?? [])
            : conversationList.value.filter((item) => item.runtimeKind !== 'local_agent')),
          ...(local.status === 'fulfilled'
            ? local.value
            : conversationList.value.filter((item) => item.runtimeKind === 'local_agent')),
        ].map((item) => [item.id, item]),
      );
      for (const [id, change] of pendingListChanges) {
        const authoritative = merged.get(id);
        const sourceSucceeded =
          change.runtimeKind === 'local_agent'
            ? local.status === 'fulfilled'
            : builtin.status === 'fulfilled';
        // Completed mutations from before a fresh stream boundary are now
        // owned by its snapshot, including deletion while we were disconnected.
        if (compactRevision !== undefined && change.revision <= compactRevision && sourceSucceeded)
          continue;
        if (
          sourceSucceeded &&
          change.revision <= revision &&
          (change.item === null
            ? !authoritative
            : authoritative &&
              (change.runtimeKind === 'local_agent' ||
                (authoritative.runtimeKind !== 'local_agent' &&
                  (authoritative.resourceVersion ?? 0) >= (change.resourceVersion ?? 0))))
        ) {
          pendingListChanges.delete(id);
        } else if (change.item) merged.set(id, change.item);
        else merged.delete(id);
      }
      for (const [id, item] of merged) {
        if (item.runtimeKind === 'local_agent') continue;
        const currentVersion = compactRevision === undefined ? (versions.get(id) ?? 0) : 0;
        if ((item.resourceVersion ?? 0) < currentVersion) {
          const current = conversationList.value.find((value) => value.id === id);
          if (current) merged.set(id, current);
          else merged.delete(id);
        } else if (item.resourceVersion !== undefined) versions.set(id, item.resourceVersion);
      }
      conversationList.value = sortConversations([...merged.values()]);
      if (builtin.status === 'rejected' || local.status === 'rejected')
        toast.error(t('aiAssistant.dialogs.chat.loadFailed'));

      // This is a paginated discovery list, not proof that a selected thread was deleted.
      return builtin.status === 'fulfilled' && local.status === 'fulfilled';
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.loadFailed'));
      return false;
    } finally {
      if (generation === listGeneration) conversationListLoading.value = false;
    }
  }

  async function refreshRuntimeHistory(
    conversationId: string,
    refreshOptions?: { preserveAcceptedDecision?: boolean },
  ): Promise<void> {
    const generation = ++historyGeneration;
    const kind = runtimeChoice.value.runtimeKind;
    const history =
      kind === 'local_agent'
        ? await options.runtime.listMessages(conversationId, kind)
        : await options.runtime.listMessages(conversationId);
    // Ask-user suspensions live in Mastra's durable run store rather than
    // ordinary text history. Restore them even if the turn never wrote a text
    // message before pausing, so a reload does not strand the pending answer.
    // Pending approvals are a separate runtime projection. A transient failure
    // must not discard successfully loaded canonical conversation history.
    const pendingAskUser =
      kind === 'local_agent'
        ? []
        : await options.runtime.listAskUserSuspensions(conversationId).catch(() => null);
    if (
      generation !== historyGeneration ||
      runtimeChoice.value.runtimeKind !== kind ||
      chatConversationId.value !== conversationId
    )
      return;
    // A user-approved tool decision must stay settled if its follow-up
    // suspension reconciliation fails. An initial reload, however, should
    // still recover canonical text history even without pending metadata.
    if (pendingAskUser === null && refreshOptions?.preserveAcceptedDecision) {
      historyIncomplete.value = true;
      throw new Error('Pending approval state unavailable');
    }
    historyIncomplete.value = Boolean(history.incomplete || pendingAskUser === null);
    const timeline = history.messages.map((message, index) => normalizeChatItem(message, index));
    for (const suspension of pendingAskUser ?? []) {
      const id = `${suspension.approval ? 'approval' : 'ask-user'}-${suspension.runId}`;
      let item = timeline.find((candidate) => candidate.id === id);
      if (!item) {
        item = { id, role: 'assistant', content: '', status: 'success', askUserRequests: [] };
        timeline.push(item);
      }
      if (suspension.approval) {
        item.approvals ??= [];
        if (!item.approvals.some((approval) => approval.toolCallId === suspension.toolCallId))
          item.approvals.push({
            ...suspension.approval,
            runId: suspension.runId,
            toolCallId: suspension.toolCallId,
            conversationId,
            status: 'pending',
            parked: true,
          });
        continue;
      }
      if (
        !item.askUserRequests?.some((candidate) => candidate.toolCallId === suspension.toolCallId)
      ) {
        item.askUserRequests ??= [];
        item.askUserRequests.push({
          ...suspension,
          conversationId,
          status: 'pending',
        });
      }
    }
    chatTimeline.value = timeline;
  }

  async function refreshRuntimeUsage(conversationId: string): Promise<void> {
    if (runtimeChoice.value.runtimeKind === 'local_agent') {
      lastRuntimeUsage.value = null;
      return;
    }
    try {
      const usage = await options.usageRuntime.get({ conversationId });
      if (chatConversationId.value !== conversationId) return;
      lastRuntimeUsage.value = {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        ...(usage.estimatedCost !== undefined ? { estimatedCost: usage.estimatedCost } : {}),
      };
    } catch {
      // Usage is observability-only: failure must never block chat/history recovery.
      if (chatConversationId.value === conversationId) lastRuntimeUsage.value = null;
    }
  }

  async function selectConversation(
    item: ConversationSummary,
    _loadService: AIChatService,
    syncModel: (key?: string) => void,
    getConversationModelKey: (id?: string) => string,
  ) {
    abortActiveStream();
    clearComposerContext();
    runtimeChoice.value =
      item.runtimeKind === 'local_agent'
        ? { runtimeKind: 'local_agent', connectionId: item.connectionId, modelId: item.modelId }
        : { runtimeKind: 'builtin' };
    chatConversationId.value = item.id;
    conversationTitle.value = item.name || t('aiAssistant.dialogs.chat.defaultConversationName');
    updateLastActiveConversation(String(item.id));
    if (item.runtimeKind !== 'local_agent') syncModel(getConversationModelKey(String(item.id)));

    const selection = selectionGeneration;
    try {
      await Promise.all([
        refreshRuntimeHistory(String(item.id)),
        refreshRuntimeUsage(String(item.id)),
      ]);
      if (selection === selectionGeneration && item.runtimeKind !== 'local_agent')
        options.restoreWorkflowState?.(String(item.id));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.loadFailed'));
    }
  }

  async function deleteConversation(
    id: string,
    loadService: AIChatService,
    onClearWorkflow: (id: string) => void,
    onClearModel: (id: string) => void,
  ) {
    try {
      // Delete authoritative Mastra memory first. If the legacy shell delete
      // subsequently fails, the still-existing shell/transcript can bootstrap
      // the thread again; the reverse order could leave an invisible orphan.
      const kind =
        conversationList.value.find((item) => item.id === id)?.runtimeKind ??
        (chatConversationId.value === id ? runtimeChoice.value.runtimeKind : 'builtin');
      if (kind === 'local_agent') await options.runtime.deleteConversation(id, kind);
      else {
        await options.runtime.deleteConversation(id);
        unwrap(await loadService.deleteConversation(id as DeleteConversationId));
      }
      onClearWorkflow(id);
      onClearModel(id);
      pendingListChanges.set(id, { revision: ++mutationRevision, item: null, runtimeKind: kind });
      conversationList.value = conversationList.value.filter((item) => item.id !== id);
      if (chatConversationId.value === id) startNewConversation();
      if (lastActiveConversationId.value === id) clearLastActiveConversation();
      toast.success(t('aiAssistant.dialogs.chat.deleted'));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.deleteFailed'));
    }
  }

  async function ensureConversationCreated(
    loadService: AIChatService,
    conversationName: string,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    if (chatConversationId.value) return chatConversationId.value;
    const choice = runtimeChoice.value;
    if (choice.runtimeKind === 'local_agent') {
      if (!options.localAgent) throw new Error('Local Agents require Desktop');
      const conversation = await options.localAgent.createConversation({
        connectionId: choice.connectionId,
        modelId: choice.modelId,
        name: conversationName,
      });
      upsertConversation(conversation);
      signal?.throwIfAborted();
      chatConversationId.value = conversation.id;
      conversationTitle.value = conversation.name;
      updateLastActiveConversation(conversation.id);
      return conversation.id;
    }
    const conversation = unwrap(
      await loadService.createConversation({
        name: conversationName,
      }),
    );
    upsertConversation(conversation);
    signal?.throwIfAborted();
    chatConversationId.value = String(conversation.id);
    conversationTitle.value = conversation.name;
    updateLastActiveConversation(String(conversation.id));
    options.onConversationCreated?.(String(conversation.id));
    return String(conversation.id);
  }

  return {
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
    refreshRuntimeHistory,
    invalidateRuntimeHistory,
    markConversationActivity,
    syncConversationSummary: upsertConversation,
    refreshRuntimeUsage,
    selectConversation,
    deleteConversation,
    ensureConversationCreated,
    normalizeChatItem,
  };
}
