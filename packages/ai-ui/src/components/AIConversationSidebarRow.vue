<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        class="group relative mb-1 flex min-h-9 items-center rounded-lg text-sm transition-colors"
        :class="
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        "
        data-testid="ai-sidebar-conversation-row"
      >
        <!-- Inline rename input -->
        <Input
          v-if="isEditing"
          ref="titleInput"
          v-model="titleDraft"
          maxlength="80"
          class="m-1 h-7 min-w-0 flex-1 px-2 py-1 text-sm outline-none ring-1 ring-inset ring-input focus:ring-ring"
          :aria-label="t('shell.conversation.rename')"
          data-testid="conversation-title-input"
          @keydown.enter.prevent="saveTitle"
          @keydown.esc.prevent="cancelEdit"
          @blur="cancelEdit"
        />

        <!-- Main title button (flex-1 with no hardcoded padding) -->
        <Button
          v-else
          variant="ghost"
          class="h-9 min-w-0 flex-1 justify-start rounded-lg py-2 pl-3 pr-1 text-left font-normal shadow-none hover:bg-transparent hover:text-inherit focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="conversation.name || t('common.untitled')"
          @dblclick.stop="startEdit"
          @click="
            showingArchive ? $emit('restore', conversation.id) : $emit('select', conversation)
          "
        >
          <span class="block min-w-0 flex-1 truncate whitespace-nowrap">
            {{ conversation.name || t('common.untitled') }}
            <span class="ml-1 text-[10px] text-muted-foreground">{{
              conversation.runtimeKind === 'local_agent'
                ? conversation.driver
                : t('aiAssistant.local.builtin')
            }}</span>
          </span>
        </Button>

        <!-- Stable trailing slot: status indicator and action controls -->
        <div
          v-if="!isEditing"
          class="relative ml-auto flex h-7 shrink-0 items-center justify-end gap-1 pr-1.5"
        >
          <!-- Status / Attention badge -->
          <Tooltip v-if="status">
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-xs"
                class="h-6 w-6 shrink-0 p-0 hover:bg-transparent"
                :aria-label="t(`aiAssistant.chatPage.sidebar.attention.${status}`)"
                data-testid="ai-sidebar-conversation-status"
                @click.stop="$emit('select', conversation)"
              >
                <component
                  :is="attentionIcon[status]"
                  class="h-4 w-4 shrink-0"
                  :class="attentionColor[status]"
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" class="text-xs">
              {{ t(`aiAssistant.chatPage.sidebar.attention.${status}`) }}
            </TooltipContent>
          </Tooltip>

          <!-- Action buttons (revealed on hover or focus-within, stable layout) -->
          <div
            class="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          >
            <Button
              variant="ghost"
              size="icon"
              :aria-label="
                t(showingArchive ? 'shell.conversation.restore' : 'shell.conversation.archive')
              "
              class="h-7 w-7 text-muted-foreground hover:text-foreground"
              :disabled="!showingArchive && ['working', 'input', 'approval'].includes(status ?? '')"
              data-testid="ai-sidebar-conversation-archive"
              @click.stop="
                showingArchive
                  ? $emit('restore', conversation.id)
                  : $emit('archive', conversation.id)
              "
            >
              <component :is="showingArchive ? ArchiveRestore : Archive" class="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  :aria-label="t('common.more')"
                  class="h-7 w-7 text-muted-foreground hover:text-foreground"
                  data-testid="ai-sidebar-conversation-more"
                >
                  <MoreHorizontal class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent @close-auto-focus="focusTitleInput">
                <DropdownMenuItem @select="startEdit">
                  {{ t('shell.conversation.rename') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  :disabled="titleBusy"
                  @select="$emit('regenerate-title', conversation.id)"
                >
                  {{
                    t(
                      titleBusy
                        ? 'shell.conversation.generatingTitle'
                        : 'shell.conversation.regenerateTitle',
                    )
                  }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive"
                  @select="$emit('delete', conversation.id)"
                >
                  <Trash2 class="mr-2 h-4 w-4" />{{ t('common.delete') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent @close-auto-focus="focusTitleInput">
      <ContextMenuItem @select="startEdit">
        {{ t('shell.conversation.rename') }}
      </ContextMenuItem>
      <ContextMenuItem :disabled="titleBusy" @select="$emit('regenerate-title', conversation.id)">
        {{
          t(titleBusy ? 'shell.conversation.generatingTitle' : 'shell.conversation.regenerateTitle')
        }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { ref, nextTick, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Archive,
  ArchiveRestore,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  MessageCircleQuestion,
  MoreHorizontal,
  ShieldAlert,
  Trash2,
} from '@lucide/vue';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@memoflow/ui-vue-shadcn';
import type { ConversationAttentionStatus } from '../composables/useConversationAttention';
import type { ConversationSummary } from '../composables/types';

const props = withDefaults(
  defineProps<{
    conversation: ConversationSummary;
    active?: boolean;
    status?: ConversationAttentionStatus | null;
    showingArchive?: boolean;
    titleBusy?: boolean;
  }>(),
  {
    active: false,
    status: null,
    showingArchive: false,
    titleBusy: false,
  },
);

const emit = defineEmits<{
  select: [conversation: ConversationSummary];
  archive: [id: string];
  restore: [id: string];
  delete: [id: string];
  rename: [id: string, name: string];
  'regenerate-title': [id: string];
}>();

const { t } = useI18n();

const attentionIcon = {
  failed: CircleAlert,
  input: MessageCircleQuestion,
  approval: ShieldAlert,
  working: LoaderCircle,
  done: CircleCheck,
} satisfies Record<ConversationAttentionStatus, Component>;

const attentionColor = {
  failed: 'text-destructive',
  input: 'text-primary',
  approval: 'text-warning',
  working: 'text-info',
  done: 'text-success',
} satisfies Record<ConversationAttentionStatus, string>;

const isEditing = ref(false);
const titleDraft = ref('');
const titleInput = ref<InstanceType<typeof Input> | HTMLInputElement | null>(null);

function getInputElement(): HTMLInputElement | null {
  const el = (titleInput.value as { $el?: unknown } | null)?.$el ?? titleInput.value;
  if (el && typeof (el as HTMLInputElement).select === 'function') {
    return el as HTMLInputElement;
  }
  if (el && typeof (el as HTMLElement).focus === 'function') {
    return el as HTMLInputElement;
  }
  return null;
}

async function startEdit() {
  isEditing.value = true;
  titleDraft.value = props.conversation.name;
  await nextTick();
  const el = getInputElement();
  el?.focus();
  el?.select();
}

async function focusTitleInput(event: Event) {
  if (!isEditing.value) return;
  event.preventDefault();
  await nextTick();
  const el = getInputElement();
  el?.focus();
  el?.select();
}

function saveTitle() {
  if (!isEditing.value || !titleDraft.value.trim()) {
    isEditing.value = false;
    return;
  }
  emit('rename', props.conversation.id, titleDraft.value);
  isEditing.value = false;
}

function cancelEdit() {
  isEditing.value = false;
}
</script>
