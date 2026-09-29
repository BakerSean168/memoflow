<template>
  <section
    class="overflow-hidden rounded-xl border border-border/70 bg-background/20"
    data-testid="task-checklist-editor"
  >
    <div class="flex min-h-11 items-center justify-between gap-3 px-3">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="text-sm font-medium">{{ t('task.checklist.title') }}</h3>
        <span v-if="modelValue.checklist.length" class="text-xs tabular-nums text-muted-foreground">
          {{ modelValue.checklist.length }}
        </span>
      </div>
      <Button
        v-if="!modelValue.checklist.length && !editorOpen"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-8 w-8 text-muted-foreground hover:text-foreground"
        :aria-label="t('task.checklist.add')"
        :disabled="disabled"
        data-testid="task-checklist-add"
        @click="openAdd"
      >
        <Plus class="h-4 w-4" />
      </Button>
    </div>

    <div
      v-if="modelValue.checklist.length"
      class="border-t border-border/60"
      data-testid="task-checklist-definition-list"
    >
      <div
        v-for="(item, index) in modelValue.checklist"
        :key="item.id"
        class="flex min-h-11 items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/25"
        :class="index > 0 ? 'border-t border-border/50' : ''"
      >
        <button
          type="button"
          class="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :disabled="disabled || editorOpen"
          :data-testid="`task-checklist-title-${index}`"
          @click="openEdit(item.id)"
        >
          <p class="truncate text-sm font-medium">{{ item.title }}</p>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
          :aria-label="t('task.checklist.remove')"
          :disabled="disabled || editorOpen"
          @click="removeItem(item.id)"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div
      v-if="modelValue.checklist.length && !editorOpen"
      class="flex justify-end border-t border-border/60 px-2 py-1.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        :aria-label="t('task.checklist.add')"
        :disabled="disabled || modelValue.checklist.length >= 100"
        data-testid="task-checklist-add"
        @click="openAdd"
      >
        <Plus class="h-3.5 w-3.5" />
        {{ t('task.checklist.add') }}
      </Button>
    </div>

    <Transition name="checklist-editor-reveal" @after-enter="ensureEditorFullyVisible">
      <div v-if="editorOpen" class="grid grid-rows-[1fr]" data-testid="task-checklist-item-form">
        <div class="min-h-0 overflow-hidden">
          <div ref="editorPanelRef" class="space-y-4 border-t border-border/60 p-4">
            <Label for="task-checklist-item-title" class="sr-only">
              {{ t('task.checklist.placeholder') }}
            </Label>
            <ProductAutoTextarea
              id="task-checklist-item-title"
              v-model="draftTitle"
              :max-length="200"
              :rows="1"
              data-testid="task-checklist-new-item"
              class="min-h-8 py-0 text-sm font-medium leading-6 text-foreground"
              :placeholder="t('task.checklist.placeholder')"
              @keydown.enter.prevent="saveItem"
            />

            <div class="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                :disabled="disabled"
                @click="cancelEdit"
              >
                {{ t('common.cancel') }}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="task-checklist-save"
                :disabled="disabled || !canSave"
                @click="saveItem"
              >
                {{ editingId ? t('common.save') : t('task.checklist.add') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Label } from '@memoflow/ui-vue-shadcn';
import { Plus, X } from '@lucide/vue';
import { ProductAutoTextarea } from '../../../../../shared/components';
import type { TaskPlanViewModel } from '../../types';

const { t } = useI18n();
const props = withDefaults(defineProps<{ modelValue: TaskPlanViewModel; disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();

const editorOpen = ref(false);
const editorPanelRef = ref<HTMLElement | null>(null);
const editingId = ref<string | null>(null);
const draftTitle = ref('');
const canSave = computed(
  () =>
    draftTitle.value.trim().length > 0 &&
    (editingId.value !== null || props.modelValue.checklist.length < 100),
);

function nextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `check-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emitChecklist(items: TaskPlanViewModel['checklist']): void {
  const normalized = items.map((item, order) => ({ ...item, order }));
  emit('update:modelValue', { ...props.modelValue, checklist: normalized });
}

function scheduleEditorVisibilityCheck(): void {
  void nextTick(() => {
    requestAnimationFrame(() => ensureEditorFullyVisible());
  });
}

function ensureEditorFullyVisible(): void {
  const panel = editorPanelRef.value;
  if (!panel) return;

  const scrollContainer = panel.closest<HTMLElement>('[data-testid="product-dialog-body"]');
  if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1) return;

  const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  scrollContainer.scrollTo?.({
    top: maxScrollTop,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
}

function openAdd(): void {
  if (props.disabled || editorOpen.value || props.modelValue.checklist.length >= 100) return;
  editingId.value = null;
  draftTitle.value = '';
  editorOpen.value = true;
}

function openEdit(id: string): void {
  if (props.disabled || editorOpen.value) return;
  const item = props.modelValue.checklist.find((candidate) => candidate.id === id);
  if (!item) return;
  editingId.value = id;
  draftTitle.value = item.title;
  editorOpen.value = true;
}

function cancelEdit(): void {
  editingId.value = null;
  draftTitle.value = '';
  editorOpen.value = false;
}

function saveItem(): void {
  const title = draftTitle.value.trim();
  if (!title || props.disabled) return;

  if (editingId.value) {
    emitChecklist(
      props.modelValue.checklist.map((item) =>
        item.id === editingId.value ? { ...item, title } : item,
      ),
    );
  } else {
    if (props.modelValue.checklist.length >= 100) return;
    emitChecklist([
      ...props.modelValue.checklist,
      { id: nextId(), title, order: props.modelValue.checklist.length },
    ]);
  }

  cancelEdit();
}

function removeItem(id: string): void {
  if (props.disabled) return;
  emitChecklist(props.modelValue.checklist.filter((item) => item.id !== id));
}

watch(
  editorOpen,
  (open) => {
    emit('update:validation', !open);
    if (open) scheduleEditorVisibilityCheck();
  },
  { immediate: true },
);
</script>

<style scoped>
.checklist-editor-reveal-enter-active,
.checklist-editor-reveal-leave-active {
  transform-origin: bottom;
  transition:
    grid-template-rows 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease-out,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.checklist-editor-reveal-enter-from,
.checklist-editor-reveal-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
  transform: translateY(6px);
}

.checklist-editor-reveal-enter-to,
.checklist-editor-reveal-leave-from {
  grid-template-rows: 1fr;
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .checklist-editor-reveal-enter-active,
  .checklist-editor-reveal-leave-active {
    transition-duration: 0.01ms;
  }

  .checklist-editor-reveal-enter-from,
  .checklist-editor-reveal-leave-to,
  .checklist-editor-reveal-enter-to,
  .checklist-editor-reveal-leave-from {
    transform: none;
  }
}
</style>
