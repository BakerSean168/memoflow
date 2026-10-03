<template>
  <div
    ref="viewport"
    class="min-h-0 flex-1 overflow-y-auto px-4 py-5 @md/ai:px-7 @xl/ai:px-10"
    data-testid="ai-message-panel"
  >
    <div
      class="mx-auto flex w-full max-w-[52rem] flex-col gap-7"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <!-- Message timeline -->
      <template v-if="timeline.length">
        <article
          v-for="item in timeline"
          :key="item.id"
          class="flex w-full"
          :class="item.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            v-if="item.role === 'user'"
            class="max-w-[88%] rounded-[16px] rounded-br-[6px] bg-[hsl(var(--surface-raised))] px-3.5 py-2.5 text-[13.5px] leading-6 text-foreground @md/ai:max-w-[82%] @xl/ai:max-w-[78%]"
            :class="semanticElevationClass('raised')"
          >
            <div v-if="item.attachments?.length" class="mb-2 flex flex-wrap gap-1.5">
              <span
                v-for="(attachment, attachmentIndex) in item.attachments"
                :key="`${item.id}:attachment:${attachmentIndex}`"
                class="inline-flex max-w-[15rem] items-center gap-1.5 rounded-md bg-[hsl(var(--surface-overlay)/0.72)] px-2 py-1 text-[11px] leading-5 text-[hsl(var(--foreground-muted))]"
                data-testid="ai-message-attachment"
              >
                <ImageIcon
                  v-if="attachment.mediaType.startsWith('image/')"
                  class="h-3.5 w-3.5 shrink-0"
                />
                <Paperclip v-else class="h-3.5 w-3.5 shrink-0" />
                <span class="truncate">{{ attachment.filename || attachment.mediaType }}</span>
              </span>
            </div>
            <p v-if="item.content.trim()" class="whitespace-pre-wrap break-words">
              {{ item.content }}
            </p>
          </div>

          <div v-else class="flex w-full min-w-0 gap-3">
            <div
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-raised))] text-[hsl(var(--foreground-subtle))]"
              :class="semanticElevationClass('inset')"
              aria-hidden="true"
            >
              <Bot class="h-3.5 w-3.5" />
            </div>
            <div class="group/message min-w-0 flex-1 pt-0.5">
              <AIMessageContent v-if="item.content.trim()" :content="item.content" />
              <p v-else class="text-sm leading-7 text-muted-foreground">
                {{ typingPlaceholder(item) }}
              </p>
              <p
                v-if="item.status === 'aborted' || item.status === 'error'"
                class="mt-2 text-xs"
                :class="item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'"
                :role="item.status === 'error' ? 'alert' : 'status'"
              >
                {{ getMessageStatusLabel(item) }}
              </p>
              <div
                v-if="item.content.trim()"
                class="mt-1.5 flex h-8 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100"
                data-testid="ai-message-actions"
              >
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  :title="
                    copiedMessageId === item.id
                      ? t('aiAssistant.chatPage.message.copied')
                      : t('aiAssistant.chatPage.message.copy')
                  "
                  :aria-label="
                    copiedMessageId === item.id
                      ? t('aiAssistant.chatPage.message.copied')
                      : t('aiAssistant.chatPage.message.copy')
                  "
                  data-testid="ai-message-copy"
                  @click="copyMessage(item.id, item.content)"
                >
                  <Check v-if="copiedMessageId === item.id" class="h-3.5 w-3.5" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  <span>{{
                    copiedMessageId === item.id
                      ? t('aiAssistant.chatPage.message.copied')
                      : t('aiAssistant.chatPage.message.copy')
                  }}</span>
                </button>
              </div>
            </div>
          </div>
        </article>

        <!-- Workflow decision surface: sits with the conversation (V2 §6.0) -->
        <div v-if="showWorkflowSurface" class="space-y-3" data-testid="ai-workflow-message-surface">
          <slot name="workflow-surface" />
        </div>
      </template>

      <!-- Welcome / idle (no messages): content sits directly on the canvas, not in a dashboard card. -->
      <div v-else class="flex min-h-[27rem] flex-col items-center justify-center py-10">
        <div class="w-full max-w-xl text-center" data-testid="ai-welcome-state">
          <div
            class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--surface-raised)/0.72)] text-[hsl(var(--foreground-muted))]"
            :class="semanticElevationClass('raised')"
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
                        : Bot
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
              class="mx-auto flex max-w-md items-center gap-2.5 rounded-xl bg-[hsl(var(--surface-raised)/0.5)] px-3 py-2.5 text-left"
              :class="semanticElevationClass('inset')"
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
                class="group flex items-center gap-2.5 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2.5 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
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
                class="group flex items-center gap-2.5 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2.5 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
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
            class="mx-auto mt-7 grid max-w-lg gap-1 @sm/ai:grid-cols-2"
          >
            <button
              v-for="entry in shortcutEntries"
              :key="entry.mode"
              type="button"
              class="group flex items-start gap-2.5 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2.5 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
              :title="t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.description`)"
              :data-testid="`ai-welcome-entry-${entry.mode}`"
              @click="$emit('select-shortcut', entry.mode)"
            >
              <span
                class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
              >
                <component :is="entry.icon" class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-foreground">
                  {{ t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.title`) }}
                </span>
                <span
                  class="mt-0.5 block truncate text-[11px] leading-4 text-[hsl(var(--foreground-subtle))]"
                >
                  {{ t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.description`) }}
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import {
  Bot,
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
import AIMessageContent from './AIMessageContent.vue';
import { getToolLocaleKey, type ChatItem, type WorkflowMode } from '../composables/types';
import { semanticElevationClass } from '../../../shared/constants/semantic-elevation';
import { useAIFormatters } from '../composables/useAIFormatters';

withDefaults(
  defineProps<{
    timeline: ChatItem[];
    toolMode: WorkflowMode;
    /** Whether AI shortcuts can proceed without redirecting to configuration. */
    hasModels?: boolean;
    /** Show workflow decision/actions + artifact surface near the timeline. */
    showWorkflowSurface?: boolean;
  }>(),
  {
    hasModels: true,
    showWorkflowSurface: false,
  },
);

defineEmits<{
  'select-shortcut': [mode: WorkflowMode];
  'configure-ai': [];
  'create-goal': [];
  'quick-task': [];
}>();

const shortcutEntries = [
  { mode: 'goal-create' as const, localeKey: 'goalCreate', icon: Sparkles },
  { mode: 'task-create' as const, localeKey: 'taskCreate', icon: ClipboardCheck },
  { mode: 'knowledge-capture' as const, localeKey: 'knowledgeCapture', icon: NotebookPen },
  { mode: 'knowledge-qa' as const, localeKey: 'knowledgeQa', icon: Search },
];

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
const { typingPlaceholder, getMessageStatusLabel } = useAIFormatters();
</script>
