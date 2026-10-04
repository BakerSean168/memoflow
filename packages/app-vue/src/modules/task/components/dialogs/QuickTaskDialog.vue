<template>
  <Dialog :open="modelValue" @update:open="setVisible">
    <ProductDialogShell
      :open="modelValue"
      test-id="quick-task-dialog"
      size="sm"
      initial-focus-selector="[data-testid='quick-task-title-input']"
    >
      <template #icon><Zap class="mt-0.5 h-5 w-5 text-warning" /></template>
      <template #title>{{ t('task.quickTask.title') }}</template>
      <template #description>{{ t('task.quickTask.subtitle') }}</template>

      <form id="quick-task-form" @submit.prevent="handleSave">
        <div class="space-y-2">
          <Label for="quick-task-title">{{ t('task.quickTask.name') }}</Label>
          <Input
            id="quick-task-title"
            v-model="title"
            data-testid="quick-task-title-input"
            :placeholder="t('task.quickTask.placeholder')"
            :disabled="saving"
            maxlength="200"
          />
          <p class="text-xs text-muted-foreground">{{ t('task.quickTask.todayAllDay') }}</p>
        </div>
      </form>

      <template #footer>
        <Button type="button" variant="ghost" :disabled="saving" @click="handleCancel">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="quick-task-form"
          :disabled="title.trim().length === 0 || saving"
          :loading="saving"
          data-testid="quick-task-save-button"
        >
          {{ t('task.quickTask.create') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Zap } from '@lucide/vue';
import { Button, Dialog, Input, Label } from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../../shared/components';
import { useDialogCloseGuard } from '../../../../shared/composables/useDialogCloseGuard';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    saving?: boolean;
  }>(),
  { saving: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [value: { title: string }];
  cancel: [];
  'dirty-change': [dirty: boolean];
}>();

const { t } = useI18n();
const title = ref('');
const isDirty = computed(() => props.modelValue && title.value.trim().length > 0);

watch(
  title,
  (value) => {
    emit('dirty-change', props.modelValue && value.trim().length > 0);
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      title.value = '';
      emit('dirty-change', false);
    } else if (!open) {
      emit('dirty-change', false);
    }
  },
  { immediate: true },
);

function closeNow(): void {
  title.value = '';
  emit('dirty-change', false);
  emit('cancel');
  emit('update:modelValue', false);
}

const { requestClose } = useDialogCloseGuard({
  dirty: isDirty,
  busy: () => props.saving,
  onClose: closeNow,
});

function setVisible(value: boolean): void {
  if (!value) void requestClose();
}

function handleCancel(): void {
  void requestClose();
}

function handleSave(): void {
  const normalizedTitle = title.value.trim();
  if (!normalizedTitle || props.saving) {
    return;
  }
  emit('save', { title: normalizedTitle });
}
</script>
