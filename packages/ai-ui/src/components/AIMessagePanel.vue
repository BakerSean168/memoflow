<template>
  <div
    ref="viewport"
    class="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable px-4 py-5 @md/ai:px-6 @xl/ai:px-10"
    data-testid="ai-message-panel"
  >
    <div
      class="mx-auto flex w-full max-w-[52rem] flex-col gap-6"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <!-- Message timeline -->
      <template v-if="timeline.length">
        <article
          v-for="row in timelineRows"
          :key="row.id"
          class="flex w-full min-w-0"
          :class="[
            row.kind === 'user-message'
              ? 'group/message flex-col items-end gap-1'
              : 'justify-start',
            row.kind === 'user-message' && row.groupedWithNext ? '-mb-3' : '',
          ]"
        >
          <template v-if="row.kind === 'user-message'">
            <div
              class="max-w-[80%] min-w-0 rounded-2xl bg-[hsl(var(--surface-raised))] px-3 py-2 text-[13.5px] leading-6 text-foreground"
              :class="[
                aiUiHost.semanticElevationClass('raised'),
                row.groupedWithPrevious ? 'rounded-tr-md' : '',
                row.groupedWithNext ? 'rounded-br-md' : '',
              ]"
            >
              <div v-if="row.item.attachments?.length" class="mb-2 flex flex-wrap gap-1.5">
                <span
                  v-for="(attachment, attachmentIndex) in row.item.attachments"
                  :key="`${row.id}:attachment:${attachmentIndex}`"
                  class="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[hsl(var(--surface-overlay)/0.72)] px-2 py-1 text-[11px] leading-5 text-[hsl(var(--foreground-muted))] sm:max-w-[15rem]"
                  data-testid="ai-message-attachment"
                >
                  <ImageIcon
                    v-if="attachment.mediaType.startsWith('image/')"
                    class="h-3.5 w-3.5 shrink-0"
                  />
                  <Paperclip v-else class="h-3.5 w-3.5 shrink-0" />
                  <span class="min-w-0 truncate">{{
                    attachment.filename || attachment.mediaType
                  }}</span>
                </span>
              </div>
              <p v-if="row.item.content.trim()" class="whitespace-pre-wrap break-words">
                {{ row.item.content }}
              </p>
            </div>
            <div
              v-if="row.item.content.trim()"
              class="flex max-w-[80%] flex-wrap items-center justify-end gap-1 pe-1 transition-opacity duration-200 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/message:opacity-100"
              :class="copiedMessageId === row.id ? 'opacity-100' : 'opacity-0'"
            >
              <Button
                type="button"
                variant="ghost"
                class="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                :title="
                  copiedMessageId === row.id
                    ? t('aiAssistant.chatPage.message.copied')
                    : t('aiAssistant.chatPage.message.copy')
                "
                :aria-label="
                  copiedMessageId === row.id
                    ? t('aiAssistant.chatPage.message.copied')
                    : t('aiAssistant.chatPage.message.copy')
                "
                data-testid="ai-user-message-copy"
                @click="copyMessage(row.id, row.item.content)"
              >
                <Check v-if="copiedMessageId === row.id" class="h-3.5 w-3.5" />
                <Copy v-else class="h-3.5 w-3.5" />
                <span>{{
                  copiedMessageId === row.id
                    ? t('aiAssistant.chatPage.message.copied')
                    : t('aiAssistant.chatPage.message.copy')
                }}</span>
              </Button>
            </div>
          </template>

          <div v-else class="flex w-full min-w-0 items-start gap-3">
            <div
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-raised))] text-[hsl(var(--foreground-subtle))]"
              :class="aiUiHost.semanticElevationClass('inset')"
              aria-hidden="true"
            >
              <MemoFlowAiIcon class="h-5 w-5" :active="row.isActive" />
            </div>
            <div class="group/message group/assistant min-w-0 flex-1 pt-0.5">
              <p
                v-if="row.localAgentSource"
                class="mb-2 break-words text-xs text-muted-foreground"
                data-testid="ai-message-native-model"
              >
                {{ row.localAgentSource.modelId }}
              </p>
              <AIActivityTimeline
                v-if="turnHasActivity(row)"
                :turn="row"
                @toggle-turn="toggleTurn"
                @toggle-work-group="toggleWorkGroup"
              />
              <section
                v-for="approval in row.approvals"
                :key="`${approval.runId}:${approval.toolCallId}`"
                class="mb-3 min-w-0 rounded-xl border border-border p-3"
                data-testid="ai-tool-approval"
                :aria-label="t('aiAssistant.chatPage.tools.approvalTitle')"
              >
                <p class="break-words text-sm font-medium">
                  {{ t(`aiAssistant.chatPage.tools.capabilities.${approval.toolName}`) }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground" role="status">
                  {{ t(`aiAssistant.chatPage.tools.${approval.status}`) }}
                </p>
                <p v-if="approval.status === 'pending'" class="mt-1 text-xs text-muted-foreground">
                  {{ t('aiAssistant.chatPage.tools.impact') }}
                </p>
                <p
                  v-if="approval.errorMessage"
                  role="alert"
                  class="mt-2 break-words text-xs text-destructive"
                >
                  {{ approval.errorMessage }}
                </p>
                <div
                  v-if="approval.status === 'pending' || approval.status === 'sending'"
                  class="mt-3 flex flex-wrap gap-2"
                >
                  <Button
                    type="button"
                    size="lg"
                    class="px-3"
                    :disabled="approval.status !== 'pending'"
                    data-testid="ai-tool-approve"
                    @click="$emit('tool-decision', approval, 'approve')"
                  >
                    {{ t('aiAssistant.chatPage.tools.approve') }}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    class="px-3"
                    :disabled="approval.status !== 'pending'"
                    data-testid="ai-tool-decline"
                    @click="$emit('tool-decision', approval, 'decline')"
                  >
                    {{ t('aiAssistant.chatPage.tools.decline') }}
                  </Button>
                </div>
              </section>
              <AILocalRequestCard
                v-for="request in row.nativeRequests"
                :key="request.request.requestId"
                :request="request"
                @respond="$emit('native-response', request, $event)"
              />
              <section
                v-for="request in row.askUserRequests"
                :key="`${request.runId}:${request.toolCallId}`"
                class="mb-3 space-y-3 rounded-xl border p-3"
                data-testid="ai-ask-user-request"
              >
                <p class="break-words text-sm font-medium">{{ request.question }}</p>
                <p class="text-xs text-muted-foreground" role="status">
                  {{ t(`aiAssistant.local.${request.status}`) }}
                </p>
                <p v-if="request.errorMessage" role="alert">
                  {{ request.errorMessage }}
                </p>
                <form
                  v-if="request.status === 'pending' || request.status === 'sending'"
                  class="space-y-2"
                  @submit.prevent="submitAskUser(request)"
                >
                  <p
                    v-if="askUserErrors[request.toolCallId]"
                    role="alert"
                    class="text-xs text-destructive"
                  >
                    {{ askUserErrors[request.toolCallId] }}
                  </p>
                  <label
                    v-if="request.options && request.selectionMode !== 'multi_select'"
                    class="block space-y-1 text-sm"
                  >
                    <span>{{ t('aiAssistant.local.chooseAnswer') }}</span>
                    <Select
                      :model-value="askUserAnswers[request.toolCallId] as string"
                      :disabled="request.status !== 'pending'"
                      @update:model-value="setAskUserAnswer(request.toolCallId, $event)"
                    >
                      <SelectTrigger
                        class="w-full"
                        :aria-label="t('aiAssistant.local.chooseAnswer')"
                      >
                        <SelectValue :placeholder="t('aiAssistant.local.chooseAnswer')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="option in request.options"
                          :key="option.label"
                          :value="option.label"
                        >
                          {{ option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <template v-else-if="request.options && request.selectionMode === 'multi_select'">
                    <label
                      v-for="option in request.options"
                      :key="option.label"
                      class="flex items-center gap-2 text-sm"
                    >
                      <input
                        v-model="askUserAnswers[request.toolCallId]"
                        type="checkbox"
                        :value="option.label"
                        :disabled="request.status !== 'pending'"
                      />
                      {{ option.label }}
                    </label>
                  </template>
                  <Input
                    v-else
                    :model-value="String(askUserAnswers[request.toolCallId] ?? '')"
                    class="w-full rounded border bg-background p-2"
                    :maxlength="4000"
                    required
                    :disabled="request.status !== 'pending'"
                    @update:model-value="askUserAnswers[request.toolCallId] = String($event)"
                  />
                  <div class="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      size="lg"
                      class="px-3"
                      :disabled="request.status !== 'pending'"
                      data-testid="ai-ask-user-submit"
                    >
                      {{ t('aiAssistant.local.answer') }}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      class="px-3"
                      :disabled="request.status !== 'pending'"
                      data-testid="ai-ask-user-cancel"
                      @click="$emit('ask-user-cancel', request)"
                    >
                      {{ t('aiAssistant.local.cancel') }}
                    </Button>
                  </div>
                </form>
              </section>
              <template v-for="part in row.messages" :key="part.id">
                <AIMessageContent
                  v-if="part.item.content.trim()"
                  :content="
                    part.item.workflowInterruption
                      ? getGoalWorkflowInterruptionMessage(part.item.workflowInterruption, t)
                      : part.item.content
                  "
                  :muted="part.item.status === 'interrupted'"
                  v-bind="
                    part.item.status === 'interrupted'
                      ? {
                          role: 'status',
                          'data-testid': 'ai-workflow-interruption',
                        }
                      : {}
                  "
                  :generating="part.item.status === 'generating'"
                />
                <p
                  v-if="part.item.status === 'aborted' || part.item.status === 'error'"
                  class="mt-2 break-words text-xs"
                  :class="
                    part.item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  "
                  :role="part.item.status === 'error' ? 'alert' : 'status'"
                >
                  {{ getMessageStatusLabel(part.item) }}
                </p>
                <div
                  v-if="part.item.content.trim() && part.item.status !== 'generating'"
                  class="mt-1.5 flex min-h-8 flex-wrap items-center gap-1 transition-opacity duration-200 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/assistant:opacity-100"
                  :class="copiedMessageId === part.id ? 'opacity-100' : 'opacity-0'"
                  data-testid="ai-message-actions"
                >
                  <Button
                    v-if="canSaveLocalNote"
                    type="button"
                    variant="ghost"
                    class="h-8 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    data-testid="ai-message-save-note"
                    @click="$emit('save-local-note', part.item.content)"
                  >
                    <NotebookPen class="h-3.5 w-3.5" />
                    {{ t('aiAssistant.local.saveNote') }}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-8 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    :title="
                      copiedMessageId === part.id
                        ? t('aiAssistant.chatPage.message.copied')
                        : t('aiAssistant.chatPage.message.copy')
                    "
                    :aria-label="
                      copiedMessageId === part.id
                        ? t('aiAssistant.chatPage.message.copied')
                        : t('aiAssistant.chatPage.message.copy')
                    "
                    data-testid="ai-message-copy"
                    @click="copyMessage(part.id, part.item.content)"
                  >
                    <Check v-if="copiedMessageId === part.id" class="h-3.5 w-3.5" />
                    <Copy v-else class="h-3.5 w-3.5" />
                    <span>{{
                      copiedMessageId === part.id
                        ? t('aiAssistant.chatPage.message.copied')
                        : t('aiAssistant.chatPage.message.copy')
                    }}</span>
                  </Button>
                </div>
              </template>
            </div>
          </div>
        </article>

        <!-- Workflow decision surface: sits with the conversation (V2 §6.0) -->
        <div v-if="showWorkflowSurface" class="space-y-3" data-testid="ai-workflow-message-surface">
          <slot name="workflow-surface" />
        </div>
      </template>

      <!-- Welcome / idle (no messages): content sits directly on the canvas, not in a dashboard card. -->
      <div
        v-else
        class="flex flex-col items-center justify-center"
        :class="toolMode === 'chat' && hasModels ? 'min-h-0 py-6' : 'min-h-[27rem] py-10'"
      >
        <div class="w-full max-w-xl text-center" data-testid="ai-welcome-state">
          <div
            class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--surface-raised)/0.72)] text-[hsl(var(--foreground-muted))]"
            :class="aiUiHost.semanticElevationClass('raised')"
          >
            <component
              :is="
                toolMode === 'knowledge-capture'
                  ? NotebookPen
                  : toolMode === 'goal-create'
                    ? Sparkles
                    : toolMode === 'task-create'
                      ? ClipboardCheck
                      : toolMode === 'knowledge-qa'
                        ? Search
                        : MemoFlowAiIcon
              "
              class="h-[18px] w-[18px]"
            />
          </div>
          <h2 class="mt-4 text-[22px] font-semibold tracking-[-0.025em] text-foreground">
            {{
              toolMode === 'chat'
                ? t('aiAssistant.chatPage.welcomeTitle')
                : t(`aiAssistant.chatPage.toolIntro.${getToolLocaleKey(toolMode)}.title`)
            }}
          </h2>
          <p
            class="mx-auto mt-2 max-w-md text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
          >
            {{
              toolMode === 'chat'
                ? t('aiAssistant.chatPage.welcomeDescription')
                : t(`aiAssistant.chatPage.toolIntro.${getToolLocaleKey(toolMode)}.description`)
            }}
          </p>

          <div
            v-if="toolMode === 'chat' && !hasModels"
            class="mt-6"
            data-testid="ai-welcome-no-model"
          >
            <div
              class="mx-auto flex max-w-md items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.5)] px-3 py-2 text-left"
              :class="aiUiHost.semanticElevationClass('inset')"
            >
              <Settings2 class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                {{ t('aiAssistant.chatPage.noModel.description') }}
              </span>
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                data-testid="ai-welcome-configure-ai"
                @click="$emit('configure-ai')"
              >
                {{ t('aiAssistant.chatPage.noModel.configure') }}
              </button>
            </div>

            <div class="mx-auto mt-4 grid max-w-md gap-1 @sm/ai:grid-cols-2">
              <button
                type="button"
                class="group flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
                data-testid="ai-welcome-create-goal"
                @click="$emit('create-goal')"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
                >
                  <Target class="h-3.5 w-3.5" />
                </span>
                <span class="truncate">{{ t('aiAssistant.chatPage.noModel.createGoal') }}</span>
              </button>
              <button
                type="button"
                class="group flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
                data-testid="ai-welcome-quick-task"
                @click="$emit('quick-task')"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
                >
                  <Plus class="h-3.5 w-3.5" />
                </span>
                <span class="truncate">{{ t('aiAssistant.chatPage.noModel.quickTask') }}</span>
              </button>
            </div>
          </div>

          <!-- Compact shortcut rows: suggestions, not dashboard cards. -->
          <div
            v-else-if="toolMode === 'chat'"
            class="mx-auto mt-6 grid max-w-lg gap-1 @sm/ai:grid-cols-2"
          >
            <button
              v-for="entry in shortcutEntries"
              :key="entry.mode"
              type="button"
              class="group flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
              :data-testid="`ai-welcome-entry-${entry.mode}`"
              @click="$emit('select-shortcut', entry.mode)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
              >
                <component :is="entry.icon" class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-foreground">
                  {{ t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.title`) }}
                </span>
              </span>
            </button>
          </div>
        </div>

        <!-- Workflow surface also available before first message (tool mode) -->
        <div
          v-if="showWorkflowSurface"
          class="mt-6 w-full max-w-xl space-y-3"
          data-testid="ai-workflow-message-surface"
        >
          <slot name="workflow-surface" />
        </div>
      </div>
      <slot name="workflow-context" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import {
  Check,
  Copy,
  ClipboardCheck,
  NotebookPen,
  ImageIcon,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn/components/ui/button';
import { Input } from '@memoflow/ui-vue-shadcn/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import type { LocalAgentRequestResponse } from '@memoflow/ai-contracts';
import AILocalRequestCard from './AILocalRequestCard.vue';
import AIMessageContent from './AIMessageContent.vue';
import AIActivityTimeline from './AIActivityTimeline.vue';
import {
  deriveChatTimelineRows,
  runTimingProjectionRevision,
  type AssistantTurnTimelineRow,
} from '../composables/agentActivity';
import MemoFlowAiIcon from './MemoFlowAiIcon.vue';
import {
  getToolLocaleKey,
  type ChatItem,
  type ChatToolApproval,
  type ChatNativeRequest,
  type ChatAskUserRequest,
  type ChatAskUserAnswer,
  type WorkflowMode,
} from '../composables/types';
import { aiUiHost } from '../ai-ui-host';
import { useAIFormatters } from '../composables/useAIFormatters';
import { getGoalWorkflowInterruptionMessage } from '../composables/error';

const props = withDefaults(
  defineProps<{
    timeline: ChatItem[];
    toolMode: WorkflowMode;
    /** Whether AI shortcuts can proceed without redirecting to configuration. */
    hasModels?: boolean;
    /** Show workflow decision/actions + artifact surface near the timeline. */
    showWorkflowSurface?: boolean;
    canSaveLocalNote?: boolean;
    canCaptureKnowledge?: boolean;
  }>(),
  {
    hasModels: true,
    showWorkflowSurface: false,
  },
);

const emit = defineEmits<{
  'select-shortcut': [mode: WorkflowMode];
  'configure-ai': [];
  'create-goal': [];
  'quick-task': [];
  'native-response': [request: ChatNativeRequest, response: LocalAgentRequestResponse['response']];
  'save-local-note': [content: string];
  'tool-decision': [approval: ChatToolApproval, decision: 'approve' | 'decline'];
  'ask-user-answer': [request: ChatAskUserRequest, answer: ChatAskUserAnswer];
  'ask-user-cancel': [request: ChatAskUserRequest];
}>();

const shortcutEntries = computed(() =>
  [
    { mode: 'goal-create' as const, localeKey: 'goalCreate', icon: Sparkles },
    {
      mode: 'task-create' as const,
      localeKey: 'taskCreate',
      icon: ClipboardCheck,
    },
    {
      mode: 'knowledge-capture' as const,
      localeKey: 'knowledgeCapture',
      icon: NotebookPen,
    },
    { mode: 'knowledge-qa' as const, localeKey: 'knowledgeQa', icon: Search },
  ].filter((entry) => entry.mode !== 'knowledge-capture' || props.canCaptureKnowledge),
);

const viewport = ref<HTMLElement | null>(null);
const copiedMessageId = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

async function copyMessage(messageId: string, content: string) {
  if (!content.trim() || typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
    return;
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    return;
  }
  copiedMessageId.value = messageId;
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    if (copiedMessageId.value === messageId) copiedMessageId.value = null;
  }, 1600);
}

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

defineExpose({ viewport });

const { t } = useI18n();
const askUserAnswers = reactive<Record<string, string | string[]>>({});
const askUserErrors = reactive<Record<string, string>>({});

function setAskUserAnswer(toolCallId: string, value: unknown) {
  askUserAnswers[toolCallId] = typeof value === 'string' ? value : '';
  if (typeof value === 'string' && value.trim()) delete askUserErrors[toolCallId];
}

function submitAskUser(request: ChatAskUserRequest) {
  const answer = askUserAnswers[request.toolCallId];
  if (request.options && request.selectionMode !== 'multi_select') {
    if (typeof answer !== 'string' || !answer.trim()) {
      askUserErrors[request.toolCallId] = t('aiAssistant.local.answerRequired');
      return;
    }
    delete askUserErrors[request.toolCallId];
  }
  emit('ask-user-answer', request, answer ?? '');
}

const { getMessageStatusLabel } = useAIFormatters();
const expandedTurnKeys = ref(new Set<string>());
const collapsedTurnKeys = ref(new Set<string>());
const expandedWorkGroupIds = ref(new Set<string>());
const collapsedWorkGroupIds = ref(new Set<string>());

function toggleTurn(turnKey: string, currentlyExpanded: boolean) {
  const nextExpanded = new Set(expandedTurnKeys.value);
  const nextCollapsed = new Set(collapsedTurnKeys.value);
  if (currentlyExpanded) {
    nextExpanded.delete(turnKey);
    nextCollapsed.add(turnKey);
  } else {
    nextCollapsed.delete(turnKey);
    nextExpanded.add(turnKey);
  }
  expandedTurnKeys.value = nextExpanded;
  collapsedTurnKeys.value = nextCollapsed;
}

function toggleWorkGroup(groupId: string, currentlyExpanded: boolean) {
  const nextExpanded = new Set(expandedWorkGroupIds.value);
  const nextCollapsed = new Set(collapsedWorkGroupIds.value);
  if (currentlyExpanded) {
    nextExpanded.delete(groupId);
    nextCollapsed.add(groupId);
  } else {
    nextCollapsed.delete(groupId);
    nextExpanded.add(groupId);
  }
  expandedWorkGroupIds.value = nextExpanded;
  collapsedWorkGroupIds.value = nextCollapsed;
}

function turnHasActivity(row: AssistantTurnTimelineRow): boolean {
  return Boolean(
    row.foldRow ||
    row.workRows.length > 0 ||
    row.isWaiting ||
    row.status === 'failed' ||
    row.status === 'interrupted' ||
    row.hasFailedTool,
  );
}

const timelineRows = computed(() => {
  void runTimingProjectionRevision.value;
  return deriveChatTimelineRows({
    timeline: props.timeline,
    expandedTurnKeys: expandedTurnKeys.value,
    collapsedTurnKeys: collapsedTurnKeys.value,
    expandedWorkGroupIds: expandedWorkGroupIds.value,
    collapsedWorkGroupIds: collapsedWorkGroupIds.value,
  });
});
</script>
