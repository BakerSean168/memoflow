<template>
  <footer
    class="global-composer-footer"
    :class="footerPaddingClass"
    data-testid="ai-footer-composer"
  >
    <div class="mx-auto flex w-full flex-col gap-2" :class="maxWidthClass">
      <slot name="action-rail" />

      <AIFooterComposerSurface
        :density="density"
        :dragging="dragging"
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
          :accept="
            localAgent
              ? undefined
              : 'image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf'
          "
          data-testid="ai-chat-file-input"
          @change="handleFileInput"
        />

        <div
          v-if="attachments.length || detachedContextEntities.length"
          class="mb-2 flex flex-wrap items-center gap-1.5 px-0.5"
          data-testid="ai-composer-context-chips"
        >
          <span
            v-for="attachment in attachments"
            :key="attachment.id"
            class="group inline-flex h-7 max-w-[15rem] items-center gap-1.5 rounded-lg bg-[hsl(var(--surface-raised))] pl-1.5 pr-1 text-[11px] text-foreground"
            :class="aiUiHost.semanticElevationClass('inset')"
            data-testid="ai-composer-attachment-chip"
          >
            <img
              v-if="
                ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
                  attachment.mediaType,
                )
              "
              :src="attachment.data"
              alt=""
              class="h-5 w-5 shrink-0 rounded object-cover"
            />
            <FileText v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{{
              attachment.filename || t('aiAssistant.chatPage.attachments.file')
            }}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-6 w-6 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              :aria-label="t('common.remove')"
              @pointerdown.prevent
              @click="$emit('remove-attachment', attachment.id)"
            >
              <X class="h-3.5 w-3.5" />
            </Button>
          </span>

          <span
            v-for="entity in detachedContextEntities"
            :key="`${entity.entityType}:${entity.id}`"
            class="inline-flex h-7 max-w-[15rem] items-center gap-1.5 rounded-lg bg-[hsl(var(--surface-raised))] pl-2 pr-1 text-[11px] text-foreground"
            :class="aiUiHost.semanticElevationClass('inset')"
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-6 w-6 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              :aria-label="t('common.remove')"
              @pointerdown.prevent
              @click="$emit('remove-context-entity', entity.entityType, entity.id)"
            >
              <X class="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>

        <div
          v-if="mentionQuery !== null"
          ref="mentionMenu"
          class="absolute bottom-[calc(100%-0.25rem)] left-2 z-50 max-h-72 w-[min(24rem,calc(100%-1rem))] overflow-y-auto rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-1"
          :class="aiUiHost.semanticElevationClass('floating')"
          data-testid="ai-composer-mention-menu"
          role="listbox"
          :aria-label="t('aiAssistant.chatPage.context.mentionHint')"
        >
          <div class="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {{ t('aiAssistant.chatPage.context.mentionHint') }}
          </div>
          <p v-if="knowledgeLoading" class="px-2 py-2 text-xs text-muted-foreground" role="status">
            {{ t('common.loading') }}
          </p>
          <p
            v-else-if="knowledgeError"
            class="px-2 py-2 text-xs text-muted-foreground"
            role="status"
          >
            {{ t('repository.hub.contextUnavailable') }}
          </p>
          <p
            v-if="!knowledgeLoading && !knowledgeError && !mentionSuggestions.length"
            class="px-2 py-2 text-xs text-muted-foreground"
          >
            {{ t('aiAssistant.chatPage.context.noNotes') }}
          </p>
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
            role="option"
            :aria-selected="index === mentionActiveIndex"
            tabindex="-1"
            @mouseenter="mentionActiveIndex = index"
            @mousedown.prevent="selectMention(suggestion)"
          >
            <Target v-if="suggestion.entityType === 'goal'" class="h-4 w-4 shrink-0" />
            <ListChecks v-else-if="suggestion.entityType === 'task'" class="h-4 w-4 shrink-0" />
            <FileText v-else class="h-4 w-4 shrink-0" />
            <span class="min-w-0 flex-1"
              ><span class="block truncate">{{ suggestion.label }}</span
              ><span
                v-if="suggestion.path"
                class="block truncate text-[11px] text-muted-foreground"
                >{{ suggestion.path }}</span
              ></span
            >
            <span class="shrink-0 text-[10px] text-muted-foreground/70">
              {{ mentionTypeLabel(suggestion.entityType) }}
            </span>
          </button>
        </div>

        <div class="relative" :class="density === 'comfortable' ? 'min-h-16' : 'min-h-10'">
          <span
            v-if="!modelValue"
            class="pointer-events-none absolute left-1 top-1 text-[13.5px] leading-6 text-[hsl(var(--foreground-subtle))]"
            aria-hidden="true"
            >{{ t('aiAssistant.dialogs.chat.messagePlaceholder') }}</span
          >
          <EditorContent
            :editor="editor"
            class="composer-editor text-[13.5px] leading-6 text-foreground"
            :class="density === 'comfortable' ? 'min-h-16' : 'min-h-10'"
            :style="{ '--composer-max-height': textareaMaxPx + 'px' }"
          />
        </div>

        <AIFooterComposerFooterControls>
          <template #attachments>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0 rounded-md p-0 text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
              data-testid="ai-chat-upload-file"
              :title="t('aiAssistant.chatPage.attachments.upload')"
              :aria-label="t('aiAssistant.chatPage.attachments.upload')"
              @pointerdown.prevent
              @click="openFilePicker"
            >
              <Paperclip class="h-4 w-4" />
            </Button>
          </template>
          <template #options>
            <slot name="provider-options">
              <div v-if="!localAgent && modelGroups.length" class="min-w-0 max-w-[15rem]">
                <Select
                  :model-value="selectedModelKey"
                  @update:model-value="$emit('select-model', String($event))"
                >
                  <SelectTrigger
                    class="h-7 w-auto min-w-0 max-w-full rounded-md border-0 bg-transparent px-2 text-xs text-[hsl(var(--foreground-subtle))] shadow-none hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus:ring-offset-0"
                    :aria-label="t('aiAssistant.chatPage.modelSelectorLabel')"
                    data-testid="ai-chat-model-selector"
                  >
                    <Bot class="mr-1.5 size-4 shrink-0" aria-hidden="true" />
                    <SelectValue
                      class="min-w-0 truncate"
                      :placeholder="t('aiAssistant.chatPage.emptyModels')"
                    />
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
                v-else-if="!localAgent"
                variant="ghost"
                class="h-7 shrink-0 rounded-md px-2 text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
                data-testid="ai-chat-empty-models"
                :title="t('aiAssistant.chatPage.emptyModelsHint')"
                @click="$emit('open-settings')"
              >
                <Settings2 class="h-4 w-4" :class="density === 'icon' ? '' : 'mr-1.5'" />
                <span v-if="density !== 'icon'" class="text-xs">
                  {{ t('aiAssistant.chatPage.emptyModelsInline') }}
                </span>
              </Button>
            </slot>
          </template>
          <AIFooterComposerPrimaryActions
            :loading="loading"
            :can-submit="canSubmit"
            @send="$emit('send')"
            @stop="$emit('stop')"
          />
        </AIFooterComposerFooterControls>
      </AIFooterComposerSurface>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import AIFooterComposerSurface from './AIFooterComposerSurface.vue';
import AIFooterComposerFooterControls from './AIFooterComposerFooterControls.vue';
import AIFooterComposerPrimaryActions from './AIFooterComposerPrimaryActions.vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { createComposerExtensions, hasAncestor } from './composer/composer-extensions';
import { collapseShownMarkdownSource } from './composer/composer-markdown-source';
import {
  buildTiptapContent,
  serializeSelection,
  splitOrLiftListItem,
  stepCaretAcrossStyledEdge,
} from './composer/composer-rich-text-doc';
import {
  convertCodeFenceOnEnter,
  exitCodeBlockOnClosingFence,
  exitCodeBlockOnTrailingBlankLines,
  indentCodeBlock,
  indentedNewlineInCodeBlock,
  selectionInOneCodeBlock,
} from './composer/composer-code-block';
import { COMPOSER_UNDO_GROUP_DELAY, markAsClipboardEdit } from './composer/composer-undo-grouping';
import { caretLineDirection } from './composer/composer-text-direction';
import { newlineInCode, splitBlockKeepMarks } from '@tiptap/pm/commands';
import type { JSONContent } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
import { history } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';
import {
  COMPOSER_MENTION,
  ComposerMentionExtension,
  composerDocument,
  composerMentionTrigger,
  composerMentions,
  composerText,
  mentionKey,
  type ComposerMention,
} from './composer-editor';
import { Bot, FileText, ListChecks, Paperclip, Settings2, Target, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
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
import { aiUiHost } from '../ai-ui-host';
import { COMPOSER_TEXTAREA_MAX_PX, type ComposerDensity } from '../ai-ui-host';

const props = withDefaults(
  defineProps<{
    localAgent?: boolean;
    modelValue: string;
    loading: boolean;
    canSend: boolean;
    attachments?: ComposerAttachment[];
    contextEntities?: ComposerContextEntity[];
    recentGoals?: AIWorkspaceRecentGoal[];
    recentTasks?: AIWorkspaceRecentTask[];
    recentKnowledgeNotes?: AIWorkspaceRecentKnowledgeNote[];
    knowledgeLoading?: boolean;
    knowledgeError?: string | null;
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
  'knowledge-query': [query: string | null];
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

// Keep the existing host focus/resize contract while replacing the native textarea.
const composerTextarea = shallowRef<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isComposing = ref(false);
const dragging = ref(false);
const mentionQuery = ref<string | null>(null);
const mentionRange = ref<{ from: number; to: number } | null>(null);
const mentionActiveIndex = ref(0);
const mentionMenu = ref<HTMLElement | null>(null);
const inlineMentions = shallowRef(new Map<string, ComposerMention>());
const textareaMaxPx = COMPOSER_TEXTAREA_MAX_PX;
let dismissedTrigger: string | null = null;

watch(mentionQuery, (query) => emit('knowledge-query', query));
const detachedContextEntities = computed(() =>
  props.contextEntities.filter((entity) => !inlineMentions.value.has(mentionKey(entity))),
);

const referenceableKnowledgeNotes = computed(() =>
  props.recentKnowledgeNotes.filter(
    (note): note is AIWorkspaceRecentKnowledgeNote & { contextId: string } =>
      typeof note.contextId === 'string' && note.contextId.length > 0,
  ),
);

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
    entityType: note.source ? ('knowledge_source' as const) : ('knowledge_document' as const),
    id: note.contextId,
    label: note.title,
    path: note.path,
    ...(note.source ? { source: note.source } : {}),
  })),
]);

const mentionSuggestions = computed(() => {
  if (mentionQuery.value === null) return [];
  const query = mentionQuery.value.trim().toLocaleLowerCase();
  const ranked = mentionCandidates.value.filter((candidate) => {
    if (!query || candidate.entityType === 'knowledge_source') return true;
    return (
      candidate.label.toLocaleLowerCase().includes(query) ||
      candidate.path?.toLocaleLowerCase().includes(query)
    );
  });
  // A bare @ must not hide notes just because the user has many goals.
  return [
    ...ranked.filter((candidate) => candidate.entityType === 'goal').slice(0, 4),
    ...ranked.filter((candidate) => candidate.entityType === 'task').slice(0, 4),
    ...ranked.filter((candidate) => candidate.entityType.startsWith('knowledge_')).slice(0, 6),
  ];
});

const canSubmit = computed(
  () =>
    !props.loading &&
    props.canSend &&
    (props.modelValue.trim().length > 0 || props.attachments.length > 0),
);

const footerPaddingClass = computed(() => {
  if (props.density === 'comfortable') return 'px-4 pb-3 pt-5 sm:px-6';
  if (props.density === 'compact') return 'px-3 pb-2 pt-4';
  return 'px-2 pb-2 pt-3';
});

const maxWidthClass = computed(() =>
  props.density === 'comfortable' ? 'max-w-[52rem]' : 'max-w-none',
);

function syncMentions(current: Editor) {
  const previous = inlineMentions.value;
  const next = composerMentions(current);
  inlineMentions.value = next;
  for (const [key, entity] of previous) {
    if (
      !next.has(key) &&
      props.contextEntities.some((item) => mentionKey(item) === key && item.origin === 'explicit')
    )
      emit('remove-context-entity', entity.entityType, entity.id);
  }
  for (const [key, entity] of next) {
    if (previous.has(key) && previous.get(key)?.source?.contentHash === entity.source?.contentHash)
      continue;
    const existing = props.contextEntities.find((item) => mentionKey(item) === key);
    if (!existing || (entity.source && entity.source.contentHash !== existing.source?.contentHash))
      emit('toggle-context-entity', entity);
  }
}

function updateMentionState(current: Editor) {
  const trigger = composerMentionTrigger(current);
  if (!trigger) {
    dismissedTrigger = null;
    closeMentionMenu();
    return;
  }
  const signature = trigger.from + ':' + trigger.to + ':' + trigger.query;
  if (dismissedTrigger === signature) return;
  dismissedTrigger = null;
  if (mentionQuery.value !== trigger.query) mentionActiveIndex.value = 0;
  mentionRange.value = { from: trigger.from, to: trigger.to };
  mentionQuery.value = trigger.query;
}

const editor = useEditor({
  extensions: [...createComposerExtensions(), ComposerMentionExtension],
  content: composerDocument(props.modelValue),
  editorProps: {
    attributes: {
      'data-testid': 'ai-chat-composer',
      class: 'composer-tiptap focus:outline-none',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': t('aiAssistant.dialogs.chat.messagePlaceholder'),
      spellcheck: 'false',
    },
    handleKeyDown: (view, event) => handleKeydown(event, view),
    handleDOMEvents: {
      paste: (view, event) => handlePaste(event, view),
      copy: (view, event) => handleCopy(view, event, false),
      cut: (view, event) => handleCopy(view, event, true),
      drop: (_view, event) => {
        if (!event.dataTransfer?.files.length) return false;
        event.preventDefault();
        event.stopPropagation();
        handleDrop(event);
        return true;
      },
      compositionstart: () => {
        isComposing.value = true;
        return false;
      },
      compositionend: () => {
        isComposing.value = false;
        return false;
      },
    },
  },
  onUpdate: ({ editor: current }) => {
    syncMentions(current);
    emit('update:modelValue', composerText(current));
    if (!isComposing.value) updateMentionState(current);
  },
  onSelectionUpdate: ({ editor: current }) => {
    if (!isComposing.value) updateMentionState(current);
  },
});
watch(
  editor,
  (current) => {
    composerTextarea.value = current?.view.dom ?? null;
  },
  { flush: 'post' },
);
defineExpose({ composerTextarea, editor });

function handleKeydown(event: KeyboardEvent, view: EditorView): boolean {
  if (isComposing.value || event.isComposing || event.keyCode === 229) return false;
  if (mentionQuery.value !== null) {
    if (event.key === 'ArrowDown' && mentionSuggestions.value.length) {
      mentionActiveIndex.value = (mentionActiveIndex.value + 1) % mentionSuggestions.value.length;
      return true;
    }
    if (event.key === 'ArrowUp' && mentionSuggestions.value.length) {
      mentionActiveIndex.value =
        (mentionActiveIndex.value - 1 + mentionSuggestions.value.length) %
        mentionSuggestions.value.length;
      return true;
    }
    if (event.key === 'Escape') {
      const range = mentionRange.value;
      if (range) dismissedTrigger = range.from + ':' + range.to + ':' + mentionQuery.value;
      closeMentionMenu();
      return true;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
      const suggestion = mentionSuggestions.value[mentionActiveIndex.value];
      if (suggestion) {
        selectMention(suggestion);
        return true;
      }
      if (event.key === 'Tab') return false;
      return true;
    }
  }
  const current = editor.value;
  if (!current) return false;
  // Source-level port: styled edges, code indentation/fence handling and list continuation.
  const backArrow = caretLineDirection(view.state) === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  if (
    ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    view.state.selection.empty
  ) {
    const direction = event.key === backArrow ? -1 : 1;
    const step = stepCaretAcrossStyledEdge(view.state, direction);
    if (step) {
      view.dispatch(step);
      return true;
    }
    const { $from } = view.state.selection;
    const adjacent = direction === -1 ? $from.nodeBefore : $from.nodeAfter;
    if (adjacent?.type.name === COMPOSER_MENTION) {
      view.dispatch(
        view.state.tr
          .setSelection(
            TextSelection.create(view.state.doc, $from.pos + direction * adjacent.nodeSize),
          )
          .scrollIntoView(),
      );
      return true;
    }
  }
  if (
    event.key === 'Tab' &&
    !event.metaKey &&
    !event.ctrlKey &&
    selectionInOneCodeBlock(view.state)
  )
    return indentCodeBlock(view.state, event.shiftKey ? 'out' : 'in', (tr) => view.dispatch(tr));
  if (event.key !== 'Enter') return false;
  if (!event.metaKey && !event.ctrlKey) {
    const dispatch = (tr: typeof view.state.tr) => view.dispatch(tr.scrollIntoView());
    if (selectionInOneCodeBlock(view.state))
      return (
        exitCodeBlockOnClosingFence(view.state, dispatch) ||
        exitCodeBlockOnTrailingBlankLines(view) ||
        indentedNewlineInCodeBlock(view.state, dispatch) ||
        newlineInCode(view.state, dispatch)
      );
    if (convertCodeFenceOnEnter(view.state, dispatch)) return true;
  }
  // In rich-text blocks Enter edits the block; Ctrl/Cmd+Enter submits explicitly.
  const inList = current.isActive('listItem') || current.isActive('taskItem');
  if (event.ctrlKey || event.metaKey || (!event.shiftKey && !inList)) {
    if (canSubmit.value) emit('send');
    return true;
  }
  if (inList && splitOrLiftListItem(current, collapseShownMarkdownSource)) return true;
  if (
    hasAncestor(view.state.selection.$from, 'blockquote') &&
    view.state.selection.$from.parent.content.size === 0 &&
    current.commands.lift('blockquote')
  )
    return true;
  return current
    .chain()
    .command(collapseShownMarkdownSource)
    .command(({ state, dispatch }) => splitBlockKeepMarks(state, dispatch))
    .scrollIntoView()
    .run();
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

function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const clipboard = event.clipboardData;
  if (!clipboard) return false;
  const directFiles = Array.from(clipboard.files ?? []);
  const itemFiles = Array.from(clipboard.items ?? []).flatMap((item) => {
    if (item.kind !== 'file') return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  const files = directFiles.length ? directFiles : itemFiles;
  if (files.length) {
    event.preventDefault();
    emit('add-files', files);
    return true;
  }
  const text = clipboard.getData?.('text/plain');
  const current = editor.value;
  if (!text || !current) return false;
  event.preventDefault();
  if (selectionInOneCodeBlock(view.state)) {
    const { from, to } = view.state.selection;
    view.dispatch(
      markAsClipboardEdit(view.state.tr.insertText(text, from, to), 'paste').scrollIntoView(),
    );
    return true;
  }
  const $paste = view.state.selection.$from;
  const nested = ['listItem', 'taskItem', 'blockquote'].some((name) => hasAncestor($paste, name));
  // Keep active reference searches literal (not interpreted as Markdown).
  const blocks = buildTiptapContent(text.replace(/\r\n?/gu, '\n'), {
    blocks: !nested,
    literalText: mentionQuery.value !== null,
  });
  const content =
    blocks.length === 1 && blocks[0]?.type === 'paragraph'
      ? (blocks[0].content as JSONContent[])
      : (blocks as JSONContent[]);
  if (!content?.length) return true;
  current
    .chain()
    .command(({ tr }) => {
      markAsClipboardEdit(tr, 'paste');
      return true;
    })
    .command(collapseShownMarkdownSource)
    .insertContent(content)
    .run();
  return true;
}

function handleCopy(view: EditorView, event: ClipboardEvent, cut: boolean): boolean {
  const { from, to, empty } = view.state.selection;
  if (empty || !event.clipboardData) return false;
  const text = serializeSelection(view.state.doc, from, to);
  event.clipboardData.setData('text/plain', text);
  event.preventDefault();
  if (cut)
    view.dispatch(markAsClipboardEdit(view.state.tr.deleteSelection(), 'cut').scrollIntoView());
  return true;
}

function handleDrop(event: DragEvent) {
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length) emit('add-files', files);
}

function closeMentionMenu() {
  mentionQuery.value = null;
  mentionRange.value = null;
  mentionActiveIndex.value = 0;
}

function selectMention(entity: ComposerMention) {
  const current = editor.value;
  const range = mentionRange.value;
  if (!current || !range) return;
  const existing = props.contextEntities.some((item) => mentionKey(item) === mentionKey(entity));
  if (!existing && props.contextEntities.length >= 12) {
    // Keep the existing context-limit notification and do not insert a phantom reference.
    emit('toggle-context-entity', entity);
    return;
  }
  current
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: COMPOSER_MENTION, attrs: { entity } },
      { type: 'text', text: ' ' },
    ])
    .run();
  closeMentionMenu();
}

function mentionTypeLabel(entityType: ComposerContextEntity['entityType']) {
  if (entityType === 'goal') return t('aiAssistant.chatPage.context.goal');
  if (entityType === 'task') return t('aiAssistant.chatPage.context.task');
  return t('aiAssistant.chatPage.context.note');
}

watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value;
    if (!current || composerText(current) === value) return;
    // External resets (send/session changes) preserve the host-owned reference state.
    inlineMentions.value = new Map();
    closeMentionMenu();
    current
      .chain()
      .setMeta('addToHistory', false)
      .setContent(composerDocument(value), { emitUpdate: false })
      .command(({ tr }) => {
        tr.setSelection(TextSelection.atEnd(tr.doc));
        return true;
      })
      .run();
    // Use Tiptap's plugin APIs so Vue's reactive EditorState remains synchronized.
    const undoPlugin = history({ newGroupDelay: COMPOSER_UNDO_GROUP_DELAY });
    if (undoPlugin.spec.key) {
      current.unregisterPlugin(undoPlugin.spec.key);
      current.registerPlugin(undoPlugin);
    }
  },
);

watch(mentionActiveIndex, async () => {
  await nextTick();
  mentionMenu.value
    ?.querySelector('[aria-selected="true"]')
    ?.scrollIntoView?.({ block: 'nearest' });
});

watch(mentionSuggestions, (items) => {
  mentionActiveIndex.value = Math.min(mentionActiveIndex.value, Math.max(items.length - 1, 0));
});
</script>

<style scoped>
.composer-editor :deep(.tiptap) {
  min-height: inherit;
  max-height: var(--composer-max-height);
  overflow-y: auto;
  padding: 0.25rem;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.composer-editor :deep(.tiptap p) {
  margin: 0;
}
</style>
