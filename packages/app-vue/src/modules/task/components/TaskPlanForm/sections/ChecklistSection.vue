<template>
  <section class="space-y-4" aria-labelledby="task-checklist-heading">
    <header class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <ListChecks class="h-5 w-5 text-primary" />
        <h3 id="task-checklist-heading" class="text-sm font-semibold">
          {{ t('task.checklist.title') }}
        </h3>
      </div>
      <span class="text-xs text-muted-foreground">{{ modelValue.checklist.length }}/100</span>
    </header>

    <div class="flex gap-2">
      <Input
        v-model="draftTitle"
        data-testid="task-checklist-new-item"
        maxlength="200"
        :placeholder="t('task.checklist.placeholder')"
        @keydown.enter.prevent="addItem"
      />
      <Button
        type="button"
        variant="outline"
        data-testid="task-checklist-add"
        :disabled="!canAdd"
        @click="addItem"
      >
        <Plus class="mr-1 h-4 w-4" />
        {{ t('task.checklist.add') }}
      </Button>
    </div>

    <p v-if="modelValue.checklist.length === 0" class="text-sm text-muted-foreground">
      {{ t('task.checklist.empty') }}
    </p>

    <div v-else class="space-y-2" data-testid="task-checklist-definition-list">
      <div
        v-for="(item, index) in modelValue.checklist"
        :key="item.id"
        class="flex items-center gap-2 rounded-lg border bg-background p-2"
      >
        <GripVertical class="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          :model-value="item.title"
          :data-testid="`task-checklist-title-${index}`"
          maxlength="200"
          @update:model-value="updateTitle(item.id, String($event))"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :aria-label="t('task.checklist.remove')"
          @click="removeItem(item.id)"
        >
          <Trash2 class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import { GripVertical, ListChecks, Plus, Trash2 } from '@lucide/vue';
import type { TaskPlanViewModel } from '../../types';

const { t } = useI18n();
const props = defineProps<{ modelValue: TaskPlanViewModel }>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();
const draftTitle = ref('');
const canAdd = computed(
  () => draftTitle.value.trim().length > 0 && props.modelValue.checklist.length < 100,
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
  emit('update:validation', true);
}

function addItem(): void {
  const title = draftTitle.value.trim();
  if (!title || props.modelValue.checklist.length >= 100) return;
  emitChecklist([
    ...props.modelValue.checklist,
    { id: nextId(), title, order: props.modelValue.checklist.length },
  ]);
  draftTitle.value = '';
}

function updateTitle(id: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) {
    emit('update:validation', false);
    return;
  }
  emitChecklist(
    props.modelValue.checklist.map((item) => (item.id === id ? { ...item, title } : item)),
  );
}

function removeItem(id: string): void {
  emitChecklist(props.modelValue.checklist.filter((item) => item.id !== id));
}
</script>
