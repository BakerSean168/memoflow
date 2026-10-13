import {
  LocalAgentActivitySchema,
  AssistantRuntimeMessageViewSchema,
  type AIRuntimeUsage,
  type AssistantRuntimeChoice,
} from '@memoflow/contracts/ai';
import { unwrap } from '@memoflow/contracts/result';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { subscribeWorkspaceEvents } from '../../../shared/services/workspace-event-subscription';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { getAIErrorMessage } from './error';
import type { AIChatService, ChatItem, ConversationSummary } from './types';

import type { UseAIChatSessionOptions } from './useAIChatSession';
const LAST_CONVERSATION_STORAGE_KEY = 'ai:last-conversation-id';
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
  const chatTimeline = ref<ChatItem[]>([]);
  const conversationTitle = ref('');
  const conversationListLoading = ref(false);
  const conversationList = ref<ConversationSummary[]>([]);
  let listGeneration = 0;
  let mutationRevision = 0;
  const versions = new Map<string, number>();
  const streamController = new AbortController();
  let listRequest: Promise<void> | null = null;
  const pendingListChanges = new Map<
    string,
    { revision: number; resourceVersion?: number; item: ConversationSummary | null; runtimeKind: 'builtin' | 'local_agent' }
  >();

  function sortConversations(items: ConversationSummary[]): ConversationSummary[] {
    return items.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
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
    if (item) conversationList.value = sortConversations(conversationList.value.map((current) =>
      current.id === id ? { ...current, updatedAt: Math.max(Number(current.updatedAt ?? 0), Date.now()) } : current));
  }

  onMounted(() => {
    if (!options.workspaceRuntime?.streamWorkspaceEvents) return;
    void subscribeWorkspaceEvents(options.workspaceRuntime, {
      signal: streamController.signal,
      onEvent: async (event) => {
        if (streamController.signal.aborted) return;
        if (event.type === 'stream.reset_required') {
          versions.clear();
          // Pending native mutations survive reset; drop ordering metadata from the old epoch.
          for (const change of pendingListChanges.values()) {
            change.resourceVersion = undefined;
            if (change.item && change.item.runtimeKind !== 'local_agent') change.item = { ...change.item, resourceVersion: undefined };
          }
          conversationList.value = conversationList.value.map((item) => item.runtimeKind === 'local_agent' ? item : { ...item,resourceVersion:undefined });
          await loadConversationList(options.service);
        } else if (event.type === 'stream.ready') {
          if (listRequest) await listRequest;
          else await loadConversationList(options.service);
        } else if (event.type === 'conversation.updated') {
          const id = event.data.conversationId;
          if (event.resourceVersion <= (versions.get(id) ?? 0)) return;
          if (event.data.conversation) {
            upsertConversation(event.data.conversation);
            if (chatConversationId.value === id) conversationTitle.value = event.data.conversation.name;
          } else {
            versions.set(id,event.resourceVersion);
            pendingListChanges.set(id,{revision:++mutationRevision,resourceVersion:event.resourceVersion,item:null,runtimeKind:'builtin'});
            conversationList.value = conversationList.value.filter((item) => item.id!==id);
            if (chatConversationId.value===id) startNewConversation();
            if (lastActiveConversationId.value===id) clearLastActiveConversation();
          }
        }
      },
    }).catch(() => { /* Explicit refresh remains available after transport or projection loss. */ });
  });
  onUnmounted(() => { streamController.abort(); listGeneration++; });

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
      status: 'success',
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

  function loadConversationList(loadService: AIChatService): Promise<void> {
    const request = performLoadConversationList(loadService);
    listRequest = request;
    void request.finally(() => { if (listRequest === request) listRequest = null; });
    return request;
  }

  async function performLoadConversationList(loadService: AIChatService) {
    const generation = ++listGeneration;
    const revision = mutationRevision;
    conversationListLoading.value = true;
    try {
      const [builtin, local] = await Promise.allSettled([
        loadService.listConversations({ page: 1, pageSize: 24 }).then(unwrap),
        options.localAgent?.listConversations() ?? Promise.resolve([]),
      ]);
      if (generation !== listGeneration) return;
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
        if (
          sourceSucceeded &&
          change.revision <= revision &&
          (change.item === null
            ? !authoritative
            : authoritative && (change.runtimeKind === 'local_agent' ||
              (authoritative.runtimeKind !== 'local_agent' &&
                (authoritative.resourceVersion ?? 0) >= (change.resourceVersion ?? 0))))
        ) {
          pendingListChanges.delete(id);
        } else if (change.item) merged.set(id, change.item);
        else merged.delete(id);
      }
      for (const [id,item] of merged) {
        if (item.runtimeKind === 'local_agent') continue;
        const currentVersion = versions.get(id) ?? 0;
        if ((item.resourceVersion ?? 0) < currentVersion) {
          const current = conversationList.value.find((value) => value.id === id);
          if (current) merged.set(id,current); else merged.delete(id);
        } else if (item.resourceVersion !== undefined) versions.set(id,item.resourceVersion);
      }
      conversationList.value = sortConversations([...merged.values()]);
      if (builtin.status === 'rejected' || local.status === 'rejected')
        toast.error(t('aiAssistant.dialogs.chat.loadFailed'));

      // This is a paginated discovery list, not proof that a selected thread was deleted.
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.loadFailed'));
    } finally {
      if (generation === listGeneration) conversationListLoading.value = false;
    }
  }

  async function refreshRuntimeHistory(conversationId: string): Promise<void> {
    const kind = runtimeChoice.value.runtimeKind;
    const history =
      kind === 'local_agent'
        ? await options.runtime.listMessages(conversationId, kind)
        : await options.runtime.listMessages(conversationId);
    // Ask-user suspensions live in Mastra's durable run store rather than
    // ordinary text history. Restore them even if the turn never wrote a text
    // message before pausing, so a reload does not strand the pending answer.
    const pendingAskUser =
      kind === 'local_agent'
        ? []
        : await options.runtime.listAskUserSuspensions(conversationId).catch(() => []);
    if (runtimeChoice.value.runtimeKind !== kind || chatConversationId.value !== conversationId)
      return;
    historyIncomplete.value = history.incomplete ?? false;
    const timeline = history.messages.map((message, index) => normalizeChatItem(message, index));
    for (const suspension of pendingAskUser) {
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

    try {
      await Promise.all([
        refreshRuntimeHistory(String(item.id)),
        refreshRuntimeUsage(String(item.id)),
      ]);
      if (item.runtimeKind !== 'local_agent') options.restoreWorkflowState?.(String(item.id));
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
    lastActiveConversationId,
    lastRuntimeUsage,
    hasWorkflowMessages,
    hasWorkflowUserMessages,
    updateLastActiveConversation,
    clearLastActiveConversation,
    loadConversationList,
    refreshRuntimeHistory,
    markConversationActivity,
    syncConversationSummary: upsertConversation,
    refreshRuntimeUsage,
    selectConversation,
    deleteConversation,
    ensureConversationCreated,
    normalizeChatItem,
  };
}
