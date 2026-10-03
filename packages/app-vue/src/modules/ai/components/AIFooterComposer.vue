<template>
  <footer
    class="global-composer-footer bg-transparent"
    :class="footerPaddingClass"
    data-testid="ai-footer-composer"
  >
    <div class="mx-auto flex w-full flex-col gap-2" :class="maxWidthClass">
      <slot name="action-rail" />

      <div
        class="relative rounded-[18px] border border-border/60 bg-card/95 shadow-[0_18px_46px_-30px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-150 focus-within:border-border focus-within:shadow-[0_20px_52px_-30px_rgba(0,0,0,0.9)]"
        :class="[
          density === 'comfortable' ? 'px-3 pb-2.5 pt-3' : 'px-2 pb-2 pt-2.5',
          dragging ? 'border-primary/60 bg-muted/20' : '',
        ]"
        data-testid="ai-composer-surface"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf"
          data-testid="ai-chat-file-input"
          @change="handleFileInput"
        />

        <div
          v-if="attachments.length || contextEntities.length"
          class="mb-2 flex flex-wrap items-center gap-1.5 px-0.5"
          data-testid="ai-composer-context-chips"
        >
          <span
            v-for="attachment in attachments"
            :key="attachment.id"
            class="group inline-flex h-8 max-w-[15rem] items-center gap-1.5 rounded-lg bg-muted/60 pl-1.5 pr-1 text-xs text-foreground"
            data-testid="ai-composer-attachment-chip"
          >
            <img
              v-if="attachment.mediaType.startsWith('image/')"
              :src="attachment.data"
              alt=""
              class="h-5 w-5 shrink-0 rounded object-cover"
            />
            <FileText v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{{
              attachment.filename || t('aiAssistant.chatPage.attachments.file')
            }}</span>
            <button
              type="button"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              :aria-label="t('common.remove')"
              @click="$emit('remove-attachment', attachment.id)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </span>

          <span
            v-for="entity in contextEntities"
            :key="`${entity.entityType}:${entity.id}`"
            class="inline-flex h-8 max-w-[15rem] items-center gap-1.5 rounded-lg bg-muted/60 pl-2 pr-1 text-xs text-foreground"
            data-testid="ai-composer-entity-chip"
            :title="
              entity.origin === 'surface'
                ? t('aiAssistant.chatPage.context.fromCurrentView')
                : entity.label
            "
          >
            <Target
              v-if="entity.entityType === 'goal'"
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <ListChecks
              v-else-if="entity.entityType === 'task'"
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <FileText v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ entity.label }}</span>
            <button
              type="button"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              :aria-label="t('common.remove')"
              @click="$emit('remove-context-entity', entity.entityType, entity.id)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        <div
          v-if="mentionSuggestions.length"
          class="absolute bottom-[calc(100%-0.25rem)] left-2 z-50 w-[min(20rem,calc(100%-1rem))] overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
          data-testid="ai-composer-mention-menu"
        >
          <div class="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {{ t('aiAssistant.chatPage.context.mentionHint') }}
          </div>
          <button
            v-for="(suggestion, index) in mentionSuggestions"
            :key="`${suggestion.entityType}:${suggestion.id}`"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
            :class="
              index === mentionActiveIndex
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            "
            data-testid="ai-composer-mention-option"
            @mousedown.prevent="selectMention(suggestion)"
          >
            <Target v-if="suggestion.entityType === 'goal'" class="h-4 w-4 shrink-0" />
            <ListChecks v-else-if="suggestion.entityType === 'task'" class="h-4 w-4 shrink-0" />
            <FileText v-else class="h-4 w-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ suggestion.label }}</span>
            <span class="shrink-0 text-[10px] text-muted-foreground/70">
              {{ mentionTypeLabel(suggestion.entityType) }}
            </span>
          </button>
        </div>

        <textarea
          ref="composerTextarea"
          :value="modelValue"
          rows="1"
          class="block min-h-[34px] w-full resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground/70 focus-visible:ring-0 disabled:cursor-wait"
          :style="{ maxHeight: `${textareaMaxPx}px` }"
          :disabled="loading"
          :placeholder="t('aiAssistant.dialogs.chat.messagePlaceholder')"
          :aria-label="t('aiAssistant.dialogs.chat.messagePlaceholder')"
          data-testid="ai-chat-composer"
          @input="handleInput"
          @paste="handlePaste"
          @keydown="handleKeydown"
          @keyup="updateMentionState"
          @click="updateMentionState"
          @compositionstart="isComposing = true"
          @compositionend="handleCompositionEnd"
        />

        <div class="mt-2 flex items-center gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 shrink-0 rounded-lg p-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  data-testid="ai-chat-add-context"
                  :title="t('aiAssistant.chatPage.attachments.addContext')"
                  :aria-label="t('aiAssistant.chatPage.attachments.addContext')"
                >
                  <Plus class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-60">
                <DropdownMenuItem data-testid="ai-chat-upload-file" @click="openFilePicker">
                  <Paperclip class="mr-2 h-4 w-4" />
                  {{ t('aiAssistant.chatPage.attachments.upload') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Target class="mr-2 h-4 w-4" />
                    {{ t('aiAssistant.chatPage.context.referenceGoal') }}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent class="w-64">
                    <DropdownMenuItem
                      v-for="goal in menuGoals"
                      :key="goal.id"
                      @click="toggleEntity({ entityType: 'goal', id: goal.id, label: goal.title })"
                    >
                      <Check v-if="hasContextEntity('goal', goal.id)" class="mr-2 h-4 w-4" />
                      <Target v-else class="mr-2 h-4 w-4 text-muted-foreground" />
                      <span class="truncate">{{ goal.title }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="!recentGoals.length" disabled>
                      {{ t('aiAssistant.chatPage.context.noGoals') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem v-else-if="recentGoals.length > menuGoals.length" disabled>
                      {{ t('aiAssistant.chatPage.context.mentionMoreHint') }}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ListChecks class="mr-2 h-4 w-4" />
                    {{ t('aiAssistant.chatPage.context.referenceTask') }}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent class="w-64">
                    <DropdownMenuItem
                      v-for="task in menuTasks"
                      :key="task.id"
                      @click="toggleEntity({ entityType: 'task', id: task.id, label: task.title })"
                    >
                      <Check v-if="hasContextEntity('task', task.id)" class="mr-2 h-4 w-4" />
                      <ListChecks v-else class="mr-2 h-4 w-4 text-muted-foreground" />
                      <span class="truncate">{{ task.title }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="!recentTasks.length" disabled>
                      {{ t('aiAssistant.chatPage.context.noTasks') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem v-else-if="recentTasks.length > menuTasks.length" disabled>
                      {{ t('aiAssistant.chatPage.context.mentionMoreHint') }}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FileText class="mr-2 h-4 w-4" />
                    {{ t('aiAssistant.chatPage.context.referenceNote') }}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent class="w-64">
                    <DropdownMenuItem
                      v-for="note in menuKnowledgeNotes"
                      :key="note.contextId"
                      @click="
                        toggleEntity({
                          entityType: 'knowledge_document',
                          id: note.contextId,
                          label: note.title,
                        })
                      "
                    >
                      <Check
                        v-if="hasContextEntity('knowledge_document', note.contextId)"
                        class="mr-2 h-4 w-4"
                      />
                      <FileText v-else class="mr-2 h-4 w-4 text-muted-foreground" />
                      <span class="truncate">{{ note.title }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="!referenceableKnowledgeNotes.length" disabled>
                      {{ t('aiAssistant.chatPage.context.noNotes') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-else-if="referenceableKnowledgeNotes.length > menuKnowledgeNotes.length"
                      disabled
                    >
                      {{ t('aiAssistant.chatPage.context.mentionMoreHint') }}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <span
              v-if="dragging && density !== 'icon'"
              class="truncate px-1 text-xs text-muted-foreground"
            >
              {{ t('aiAssistant.chatPage.attachments.dropHere') }}
            </span>
          </div>

          <div v-if="modelGroups.length" class="min-w-0 shrink-0">
            <Select
              :model-value="selectedModelKey"
              @update:model-value="$emit('select-model', String($event))"
            >
              <SelectTrigger
                class="h-8 w-auto min-w-[8rem] max-w-[13rem] rounded-lg border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted/70 hover:text-foreground focus:ring-0 focus:ring-offset-0"
                :aria-label="t('aiAssistant.chatPage.modelSelectorLabel')"
              >
                <SelectValue :placeholder="t('aiAssistant.chatPage.emptyModels')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup v-for="group in modelGroups" :key="group.providerId">
                  <SelectLabel>{{ group.providerName }}</SelectLabel>
                  <SelectItem v-for="model in group.models" :key="model.key" :value="model.key">
                    {{ model.modelName }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Button
            v-else
            variant="ghost"
            class="h-8 shrink-0 rounded-lg px-2 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            data-testid="ai-chat-empty-models"
            :title="t('aiAssistant.chatPage.emptyModelsHint')"
            @click="$emit('open-settings')"
          >
            <Settings2 class="h-4 w-4" :class="density === 'icon' ? '' : 'mr-1.5'" />
            <span v-if="density !== 'icon'" class="text-xs">
              {{ t('aiAssistant.chatPage.emptyModelsInline') }}
            </span>
          </Button>

          <Button
            v-if="loading"
            variant="outline"
            size="icon"
            class="h-8 w-8 shrink-0 rounded-full p-0"
            data-testid="ai-chat-stop-generating"
            :title="t('aiAssistant.dialogs.chat.stopGenerating')"
            :aria-label="t('aiAssistant.dialogs.chat.stopGenerating')"
            @click="$emit('stop')"
          >
            <Square class="h-3.5 w-3.5" />
          </Button>
          <Button
            v-else
            size="icon"
            class="h-8 w-8 shrink-0 rounded-full p-0"
            :disabled="!canSubmit"
            data-testid="ai-chat-send-message"
            :title="t('aiAssistant.dialogs.chat.sendMessage')"
            :aria-label="t('aiAssistant.dialogs.chat.sendMessage')"
            @click="$emit('send')"
          >
            <ArrowUp class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  ArrowUp,
  Check,
  FileText,
  ListChecks,
  Paperclip,
  Plus,
  Settings2,
  Square,
  Target,
  X,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import type {
  AIWorkspaceRecentGoal,
  AIWorkspaceRecentKnowledgeNote,
  AIWorkspaceRecentTask,
  ChatModelOption,
  ComposerAttachment,
  ComposerContextEntity,
} from '../composables/types';
import {
  COMPOSER_TEXTAREA_MAX_PX,
  type ComposerDensity,
} from '../../../layouts/shell/panel-geometry';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    loading: boolean;
    canSend: boolean;
    attachments?: ComposerAttachment[];
    contextEntities?: ComposerContextEntity[];
    recentGoals?: AIWorkspaceRecentGoal[];
    recentTasks?: AIWorkspaceRecentTask[];
    recentKnowledgeNotes?: AIWorkspaceRecentKnowledgeNote[];
    modelGroups: Array<{
      providerId: string;
      providerName: string;
      models: ChatModelOption[];
    }>;
    selectedModelKey: string;
    density?: ComposerDensity;
  }>(),
  {
    density: 'comfortable',
    attachments: () => [],
    contextEntities: () => [],
    recentGoals: () => [],
    recentTasks: () => [],
    recentKnowledgeNotes: () => [],
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  send: [];
  stop: [];
  'select-model': [modelKey: string];
  'open-settings': [];
  'add-files': [files: File[]];
  'remove-attachment': [id: string];
  'toggle-context-entity': [entity: Omit<ComposerContextEntity, 'origin'>];
  'remove-context-entity': [entityType: ComposerContextEntity['entityType'], id: string];
}>();

const { t } = useI18n();

const composerTextarea = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isComposing = ref(false);
const dragging = ref(false);
const mentionQuery = ref<string | null>(null);
const mentionStart = ref<number | null>(null);
const mentionActiveIndex = ref(0);
const textareaMaxPx = COMPOSER_TEXTAREA_MAX_PX;

const menuGoals = computed(() => props.recentGoals.slice(0, 8));
const menuTasks = computed(() => props.recentTasks.slice(0, 8));

const referenceableKnowledgeNotes = computed(() =>
  props.recentKnowledgeNotes.filter(
    (note): note is AIWorkspaceRecentKnowledgeNote & { contextId: string } =>
      typeof note.contextId === 'string' && note.contextId.length > 0,
  ),
);

const menuKnowledgeNotes = computed(() => referenceableKnowledgeNotes.value.slice(0, 8));

const mentionCandidates = computed<Array<Omit<ComposerContextEntity, 'origin'>>>(() => [
  ...props.recentGoals.map((goal) => ({
    entityType: 'goal' as const,
    id: goal.id,
    label: goal.title,
  })),
  ...props.recentTasks.map((task) => ({
    entityType: 'task' as const,
    id: task.id,
    label: task.title,
  })),
  ...referenceableKnowledgeNotes.value.map((note) => ({
    entityType: 'knowledge_document' as const,
    id: note.contextId,
    label: note.title,
  })),
]);

const mentionSuggestions = computed(() => {
  if (mentionQuery.value === null) return [];
  const query = mentionQuery.value.trim().toLocaleLowerCase();
  const ranked = mentionCandidates.value.filter((candidate) => {
    if (!query) return true;
    return candidate.label.toLocaleLowerCase().includes(query);
  });
  return ranked.slice(0, 6);
});

const canSubmit = computed(
  () =>
    !props.loading &&
    props.canSend &&
    (props.modelValue.trim().length > 0 || props.attachments.length > 0),
);

const footerPaddingClass = computed(() => {
  if (props.density === 'comfortable') return 'px-4 pb-4 pt-2 sm:px-6';
  if (props.density === 'compact') return 'px-3 pb-3 pt-1.5';
  return 'px-2 pb-2 pt-1';
});

const maxWidthClass = computed(() =>
  props.density === 'comfortable' ? 'max-w-[52rem]' : 'max-w-none',
);

defineExpose({ composerTextarea });

function resizeTextarea() {
  const el = composerTextarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, textareaMaxPx)}px`;
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
  void nextTick(() => {
    resizeTextarea();
    updateMentionState();
  });
}

function handleCompositionEnd(event: CompositionEvent) {
  isComposing.value = false;
  const target = event.target as HTMLTextAreaElement | null;
  if (target) {
    emit('update:modelValue', target.value);
    void nextTick(resizeTextarea);
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (mentionSuggestions.value.length) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mentionActiveIndex.value = (mentionActiveIndex.value + 1) % mentionSuggestions.value.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      mentionActiveIndex.value =
        (mentionActiveIndex.value - 1 + mentionSuggestions.value.length) %
        mentionSuggestions.value.length;
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMentionMenu();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const suggestion = mentionSuggestions.value[mentionActiveIndex.value];
      if (suggestion) selectMention(suggestion);
      return;
    }
  }

  if (event.key !== 'Enter' || event.shiftKey) return;
  if (isComposing.value || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!canSubmit.value) return;
  emit('send');
}

function openFilePicker() {
  fileInput.value?.click();
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length) emit('add-files', files);
  input.value = '';
}

function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const directFiles = Array.from(clipboard.files ?? []);
  const itemFiles = Array.from(clipboard.items ?? []).flatMap((item) => {
    if (item.kind !== 'file') return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  const files = directFiles.length ? directFiles : itemFiles;
  if (!files.length) return;
  event.preventDefault();
  emit('add-files', files);
}

function handleDrop(event: DragEvent) {
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length) emit('add-files', files);
}

function closeMentionMenu() {
  mentionQuery.value = null;
  mentionStart.value = null;
  mentionActiveIndex.value = 0;
}

function updateMentionState() {
  const textarea = composerTextarea.value;
  if (!textarea) return closeMentionMenu();
  const caret = textarea.selectionStart ?? textarea.value.length;
  const prefix = textarea.value.slice(0, caret);
  const match = prefix.match(/(?:^|\s)@([^@\s]{0,60})$/u);
  if (!match) return closeMentionMenu();
  const token = match[0];
  const atOffset = token.lastIndexOf('@');
  mentionQuery.value = match[1] ?? '';
  mentionStart.value = caret - token.length + atOffset;
  mentionActiveIndex.value = Math.min(
    mentionActiveIndex.value,
    Math.max(mentionSuggestions.value.length - 1, 0),
  );
}

function selectMention(entity: Omit<ComposerContextEntity, 'origin'>) {
  const textarea = composerTextarea.value;
  const start = mentionStart.value;
  if (!textarea || start === null) return;
  const caret = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(caret);
  const token = `@${entity.label}`;
  const next = `${before}${token} ${after}`;
  emit('update:modelValue', next);
  if (!hasContextEntity(entity.entityType, entity.id)) emit('toggle-context-entity', entity);
  closeMentionMenu();
  void nextTick(() => {
    const nextCaret = before.length + token.length + 1;
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function mentionTypeLabel(entityType: ComposerContextEntity['entityType']) {
  if (entityType === 'goal') return t('aiAssistant.chatPage.context.goal');
  if (entityType === 'task') return t('aiAssistant.chatPage.context.task');
  return t('aiAssistant.chatPage.context.note');
}

function hasContextEntity(entityType: ComposerContextEntity['entityType'], id: string) {
  return props.contextEntities.some(
    (entity) => entity.entityType === entityType && entity.id === id,
  );
}

function toggleEntity(entity: Omit<ComposerContextEntity, 'origin'>) {
  emit('toggle-context-entity', entity);
}

watch(
  () => props.modelValue,
  () => {
    void nextTick(resizeTextarea);
  },
);
</script>
