import {
  LocalAgentActivitySchema,
  type AIRuntimeUsage,
  type AssistantRuntimeChoice,
} from '@memoflow/contracts/ai';
import { unwrap } from '@memoflow/contracts/result';
import { computed, ref } from 'vue';
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

  async function loadConversationList(
    loadService: AIChatService,
    listOptions?: { preserveSelection?: boolean },
  ) {
    conversationListLoading.value = true;
    try {
      const [builtin, local] = await Promise.allSettled([
        loadService.listConversations({ page: 1, pageSize: 24 }).then(unwrap),
        options.localAgent?.listConversations() ?? Promise.resolve([]),
      ]);
      conversationList.value = [
        ...(builtin.status === 'fulfilled' ? (builtin.value.data ?? []) : []),
        ...(local.status === 'fulfilled' ? local.value : []),
      ].sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
      if (builtin.status === 'rejected' || local.status === 'rejected')
        toast.error(t('aiAssistant.dialogs.chat.loadFailed'));

      if (listOptions?.preserveSelection !== false && chatConversationId.value) {
        const currentConversation = conversationList.value.find(
          (item) => item.id === chatConversationId.value,
        );
        if (!currentConversation) startNewConversation();
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.loadFailed'));
    } finally {
      conversationListLoading.value = false;
    }
  }

  async function refreshRuntimeHistory(conversationId: string): Promise<void> {
    const kind = runtimeChoice.value.runtimeKind;
    const history =
      kind === 'local_agent'
        ? await options.runtime.listMessages(conversationId, kind)
        : await options.runtime.listMessages(conversationId);
    if (runtimeChoice.value.runtimeKind !== kind) return;
    historyIncomplete.value = history.incomplete ?? false;
    if (chatConversationId.value !== conversationId) return;
    chatTimeline.value = history.messages.map((message, index) =>
      normalizeChatItem(message, index),
    );
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
      if (chatConversationId.value === id) startNewConversation();
      if (lastActiveConversationId.value === id) clearLastActiveConversation();
      await loadConversationList(loadService);
      toast.success(t('aiAssistant.dialogs.chat.deleted'));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.dialogs.chat.deleteFailed'));
    }
  }

  async function ensureConversationCreated(loadService: AIChatService, conversationName: string) {
    if (chatConversationId.value) return chatConversationId.value;
    const choice = runtimeChoice.value;
    if (choice.runtimeKind === 'local_agent') {
      if (!options.localAgent) throw new Error('Local Agents require Desktop');
      const conversation = await options.localAgent.createConversation({
        connectionId: choice.connectionId,
        modelId: choice.modelId,
        name: conversationName,
      });
      chatConversationId.value = conversation.id;
      updateLastActiveConversation(conversation.id);
      return conversation.id;
    }
    const conversation = unwrap(
      await loadService.createConversation({
        name: conversationName,
      }),
    );
    chatConversationId.value = String(conversation.id);
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
    refreshRuntimeUsage,
    selectConversation,
    deleteConversation,
    ensureConversationCreated,
    normalizeChatItem,
  };
}
