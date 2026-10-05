import { computed, nextTick, ref, shallowRef } from 'vue';
import type {
  AIRuntimeUsage,
  AssistantRuntimeEvent,
  AssistantRuntimeSelectedEntity,
  AIRuntimeSurface,
} from '@memoflow/contracts/ai';
import type { AssistantRuntimeClient, RuntimeUsageClient } from '@memoflow/ai/client';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type {
  AIChatService,
  ChatItem,
  ChatToolApproval,
  ChatModelOption,
  ComposerAttachment,
  ComposerContextEntity,
  ConversationSummary,
} from './types';
import { unwrap } from '@memoflow/contracts/result';
import { getAIErrorMessage } from './error';

const LAST_CONVERSATION_STORAGE_KEY = 'ai:last-conversation-id';
const MAX_COMPOSER_ATTACHMENTS = 4;
const MAX_COMPOSER_ATTACHMENT_BYTES = 1_000_000;
const MAX_COMPOSER_ATTACHMENT_TOTAL_BYTES = 1_200_000;
const MAX_COMPOSER_CONTEXT_ENTITIES = 12;
const COMPOSER_IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const COMPOSER_DOCUMENT_MEDIA_TYPES = new Set(['text/plain', 'text/markdown', 'application/pdf']);
const STREAM_DELTA_FLUSH_MS = 48;
const STREAM_AUTO_FOLLOW_THRESHOLD_PX = 96;
type DeleteConversationId = Parameters<AIChatService['deleteConversation']>[0];
type RuntimeSelectableEntityType = AssistantRuntimeSelectedEntity['entityType'];

function isRuntimeSelectableEntity(
  entity: ComposerContextEntity,
): entity is ComposerContextEntity & { entityType: RuntimeSelectableEntityType } {
  return (
    entity.entityType === 'goal' ||
    entity.entityType === 'task' ||
    entity.entityType === 'knowledge_document'
  );
}

export interface UseAIChatSessionOptions {
  /** Transitional shell/workflow client. Open-chat transcript execution never uses it. */
  service: AIChatService;
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
  const chatLoading = ref(false);
  const chatConversationId = ref('');
  const chatTimeline = ref<ChatItem[]>([]);
  const conversationTitle = ref('');
  const conversationListLoading = ref(false);
  const conversationList = ref<ConversationSummary[]>([]);
  const lastActiveConversationId = ref('');
  const messagesViewport = ref<HTMLElement | null>(null);
  const composerTextarea = ref<HTMLTextAreaElement | null>(null);
  const activeStreamAbortController = shallowRef<AbortController | null>(null);
  const activeRuntimeRunId = ref<string | null>(null);
  const lastRuntimeUsage = ref<AIRuntimeUsage | null>(null);
  const composerAttachments = ref<ComposerAttachment[]>([]);
  const composerContextEntities = ref<ComposerContextEntity[]>([]);
  const suppressedSurfaceContextKey = ref<string | null>(null);
  let pendingStreamDelta = '';
  let pendingStreamAssistantId: string | null = null;
  let pendingStreamFlushTimer: ReturnType<typeof setTimeout> | null = null;

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
    item: { id?: unknown; role?: unknown; content?: unknown; attachments?: unknown },
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
      status: 'success',
    };
  }

  function inferAttachmentMediaType(file: File): string {
    const provided = file.type.trim().toLowerCase();
    if (provided) return provided;
    const name = file.name.toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  function isSupportedAttachmentMediaType(mediaType: string): boolean {
    return (
      COMPOSER_IMAGE_MEDIA_TYPES.has(mediaType) || COMPOSER_DOCUMENT_MEDIA_TYPES.has(mediaType)
    );
  }

  function fileToDataUrl(file: File, mediaType: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('FILE_READ_FAILED'));
      reader.onload = () => {
        const raw = String(reader.result ?? '');
        const commaIndex = raw.indexOf(',');
        if (commaIndex <= 0) return reject(new Error('FILE_READ_INVALID_DATA_URL'));
        resolve(`data:${mediaType};base64,${raw.slice(commaIndex + 1)}`);
      };
      reader.readAsDataURL(file);
    });
  }

  async function addComposerFiles(files: readonly File[]) {
    const room = MAX_COMPOSER_ATTACHMENTS - composerAttachments.value.length;
    if (room <= 0) {
      toast.error(
        t('aiAssistant.chatPage.attachments.tooMany', { count: MAX_COMPOSER_ATTACHMENTS }),
      );
      return;
    }
    const accepted = [...files].slice(0, room);
    if (files.length > room) {
      toast.error(
        t('aiAssistant.chatPage.attachments.tooMany', { count: MAX_COMPOSER_ATTACHMENTS }),
      );
    }
    let totalBytes = composerAttachments.value.reduce(
      (sum, attachment) => sum + attachment.size,
      0,
    );
    for (const file of accepted) {
      const mediaType = inferAttachmentMediaType(file);
      if (!isSupportedAttachmentMediaType(mediaType)) {
        toast.error(t('aiAssistant.chatPage.attachments.unsupportedType', { name: file.name }));
        continue;
      }
      if (file.size > MAX_COMPOSER_ATTACHMENT_BYTES) {
        toast.error(t('aiAssistant.chatPage.attachments.tooLarge', { name: file.name }));
        continue;
      }
      if (totalBytes + file.size > MAX_COMPOSER_ATTACHMENT_TOTAL_BYTES) {
        toast.error(t('aiAssistant.chatPage.attachments.totalTooLarge'));
        break;
      }
      try {
        const data = await fileToDataUrl(file, mediaType);
        if (!data) throw new Error('FILE_READ_EMPTY');
        composerAttachments.value.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          data,
          mediaType,
          filename: file.name || undefined,
          size: file.size,
        });
        totalBytes += file.size;
      } catch {
        toast.error(t('aiAssistant.chatPage.attachments.readFailed', { name: file.name }));
      }
    }
  }

  function removeComposerAttachment(id: string) {
    composerAttachments.value = composerAttachments.value.filter(
      (attachment) => attachment.id !== id,
    );
  }

  function upsertContextEntity(entity: ComposerContextEntity) {
    const key = `${entity.entityType}:${entity.id}`;
    const existing = composerContextEntities.value.findIndex(
      (item) => `${item.entityType}:${item.id}` === key,
    );
    if (existing >= 0) composerContextEntities.value.splice(existing, 1, entity);
    else composerContextEntities.value.push(entity);
  }

  function toggleExplicitContextEntity(entity: Omit<ComposerContextEntity, 'origin'>) {
    const key = `${entity.entityType}:${entity.id}`;
    const existing = composerContextEntities.value.findIndex(
      (item) => `${item.entityType}:${item.id}` === key && item.origin === 'explicit',
    );
    if (existing >= 0) {
      composerContextEntities.value.splice(existing, 1);
      return;
    }
    if (composerContextEntities.value.length >= MAX_COMPOSER_CONTEXT_ENTITIES) {
      toast.error(
        t('aiAssistant.chatPage.context.tooMany', { count: MAX_COMPOSER_CONTEXT_ENTITIES }),
      );
      return;
    }
    upsertContextEntity({ ...entity, origin: 'explicit' });
  }

  function setSurfaceContextEntity(entity: Omit<ComposerContextEntity, 'origin'> | null) {
    const previousSurface = composerContextEntities.value.find((item) => item.origin === 'surface');
    const previousKey = previousSurface
      ? `${previousSurface.entityType}:${previousSurface.id}`
      : null;
    const nextKey = entity ? `${entity.entityType}:${entity.id}` : null;

    composerContextEntities.value = composerContextEntities.value.filter(
      (item) => item.origin !== 'surface',
    );

    // A user-dismissed current-view chip stays dismissed while the same
    // surface remains visible. Moving to a different surface restores the
    // default implicit-context behavior for that new object.
    if (!entity) {
      suppressedSurfaceContextKey.value = null;
      return;
    }
    if (previousKey && previousKey !== nextKey) suppressedSurfaceContextKey.value = null;
    if (suppressedSurfaceContextKey.value === nextKey) return;

    const alreadyExplicit = composerContextEntities.value.some(
      (item) =>
        item.origin === 'explicit' &&
        item.entityType === entity.entityType &&
        item.id === entity.id,
    );
    if (!alreadyExplicit && composerContextEntities.value.length < MAX_COMPOSER_CONTEXT_ENTITIES) {
      upsertContextEntity({ ...entity, origin: 'surface' });
    }
  }

  function removeContextEntity(entityType: ComposerContextEntity['entityType'], id: string) {
    const removed = composerContextEntities.value.find(
      (item) => item.entityType === entityType && item.id === id,
    );
    if (removed?.origin === 'surface') {
      suppressedSurfaceContextKey.value = `${entityType}:${id}`;
    }
    composerContextEntities.value = composerContextEntities.value.filter(
      (item) => !(item.entityType === entityType && item.id === id),
    );
  }

  function clearComposerTurnState() {
    composerAttachments.value = [];
  }

  function clearComposerContext() {
    composerAttachments.value = [];
    composerContextEntities.value = [];
    suppressedSurfaceContextKey.value = null;
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
    void options.runtime.cancelRun(runId).catch(() => {
      // Transport abort is already applied locally; owner-scoped cancel is best effort.
    });
  }

  function updateLastActiveConversation(id: string) {
    lastActiveConversationId.value = id;
    localStorage.setItem(LAST_CONVERSATION_STORAGE_KEY, id);
  }

  function clearLastActiveConversation() {
    lastActiveConversationId.value = '';
    localStorage.removeItem(LAST_CONVERSATION_STORAGE_KEY);
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

  async function loadConversationList(
    loadService: AIChatService,
    listOptions?: { preserveSelection?: boolean },
  ) {
    conversationListLoading.value = true;
    try {
      const result = unwrap(await loadService.listConversations({ page: 1, pageSize: 24 }));
      conversationList.value = result.data ?? [];

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
    const history = await options.runtime.listMessages(conversationId);
    if (chatConversationId.value !== conversationId) return;
    chatTimeline.value = history.messages.map((message, index) =>
      normalizeChatItem(message, index),
    );
  }

  async function refreshRuntimeUsage(conversationId: string): Promise<void> {
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
    chatConversationId.value = item.id;
    conversationTitle.value = item.name || t('aiAssistant.dialogs.chat.defaultConversationName');
    updateLastActiveConversation(String(item.id));
    syncModel(getConversationModelKey(String(item.id)));

    try {
      await Promise.all([
        refreshRuntimeHistory(String(item.id)),
        refreshRuntimeUsage(String(item.id)),
      ]);
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
      await options.runtime.deleteConversation(id);
      unwrap(await loadService.deleteConversation(id as DeleteConversationId));
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

  function applyRuntimeEvent(event: AssistantRuntimeEvent, assistantDraftId: string) {
    if (event.conversationId !== chatConversationId.value) return;
    if (activeRuntimeRunId.value && event.runId !== activeRuntimeRunId.value) return;
    const item = chatTimeline.value.find((candidate) => candidate.id === assistantDraftId);
    if (!item) return;
    if (event.type === 'assistant.activity') {
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
    if (!selectedModel || chatLoading.value) return;

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
      const pendingEntities: AssistantRuntimeSelectedEntity[] = composerContextEntities.value
        .filter(isRuntimeSelectableEntity)
        .map((entity) => ({
          entityType: entity.entityType,
          id: entity.id,
          label: entity.label,
        }));
      const pendingUserMessage = chatMessage.value.trim();
      if (!pendingUserMessage && pendingAttachments.length === 0) return;

      chatLoading.value = true;
      conversationId = await ensureConversationCreated(loadService, conversationName);
      streamController = new AbortController();
      activeStreamAbortController.value = streamController;
      activeRuntimeRunId.value = null;
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
          providerId: selectedModel.providerId,
          modelId: selectedModel.modelId,
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
      if (isAbortLikeError(error)) {
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
      }
      activeRuntimeRunId.value = null;
      chatLoading.value = false;
    }
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
