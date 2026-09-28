<template>
  <div
    ref="viewport"
    class="min-h-0 flex-1 overflow-y-auto px-4 py-6 @md/ai:px-7 @xl/ai:px-10"
    data-testid="ai-message-panel"
  >
    <div
      class="mx-auto flex w-full max-w-3xl flex-col gap-6"
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
            class="max-w-[88%] rounded-[14px] bg-muted/70 px-4 py-2.5 text-sm leading-7 text-foreground @md/ai:max-w-[82%] @xl/ai:max-w-[78%]"
          >
            <div v-if="item.attachments?.length" class="mb-2 flex flex-wrap gap-1.5">
              <span
                v-for="(attachment, attachmentIndex) in item.attachments"
                :key="`${item.id}:attachment:${attachmentIndex}`"
                class="inline-flex max-w-[15rem] items-center gap-1.5 rounded-md bg-background/35 px-2 py-1 text-xs leading-5 text-muted-foreground"
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
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"
              aria-hidden="true"
            >
              <Bot class="h-3.5 w-3.5" />
            </div>
            <div class="min-w-0 flex-1 pt-0.5 text-sm leading-7 text-foreground">
              <p class="whitespace-pre-wrap break-words">
                {{ item.content || typingPlaceholder(item) }}
              </p>
              <p
                v-if="item.status === 'aborted' || item.status === 'error'"
                class="mt-2 text-xs"
                :class="item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'"
                :role="item.status === 'error' ? 'alert' : 'status'"
              >
                {{ getMessageStatusLabel(item) }}
              </p>
            </div>
          </div>
        </article>

        <!-- Workflow decision surface: sits with the conversation (V2 §6.0) -->
        <div v-if="showWorkflowSurface" class="space-y-3" data-testid="ai-workflow-message-surface">
          <slot name="workflow-surface" />
        </div>
      </template>

      <!-- Welcome / idle (no messages): content sits directly on the canvas, not in a dashboard card. -->
      <div v-else class="flex min-h-[24rem] flex-col items-center justify-center py-10">
        <div class="w-full max-w-xl text-center" data-testid="ai-welcome-state">
          <div
            class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground"
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
          <h2 class="mt-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
            {{
              toolMode === 'chat'
                ? t('aiAssistant.chatPage.welcomeTitle')
                : t(`aiAssistant.chatPage.toolIntro.${getToolLocaleKey(toolMode)}.title`)
            }}
          </h2>
          <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
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
              class="mx-auto flex max-w-md items-center gap-2.5 rounded-xl bg-muted/35 px-3 py-2.5 text-left"
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
                class="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
                data-testid="ai-welcome-create-goal"
                @click="$emit('create-goal')"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:text-foreground"
                >
                  <Target class="h-3.5 w-3.5" />
                </span>
                <span class="truncate">{{ t('aiAssistant.chatPage.noModel.createGoal') }}</span>
              </button>
              <button
                type="button"
                class="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
                data-testid="ai-welcome-quick-task"
                @click="$emit('quick-task')"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:text-foreground"
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
              class="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
              :title="t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.description`)"
              :data-testid="`ai-welcome-entry-${entry.mode}`"
              @click="$emit('select-shortcut', entry.mode)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:text-foreground"
              >
                <component :is="entry.icon" class="h-3.5 w-3.5" />
              </span>
              <span class="truncate font-medium">
                {{ t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.title`) }}
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
import { ref } from 'vue';
import {
  Bot,
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
import { getToolLocaleKey, type ChatItem, type WorkflowMode } from '../composables/types';
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

defineExpose({ viewport });

const { t } = useI18n();
const { typingPlaceholder, getMessageStatusLabel } = useAIFormatters();
</script>
