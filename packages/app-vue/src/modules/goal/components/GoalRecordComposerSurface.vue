<template>
  <form id="goal-record-form" class="space-y-5" @submit.prevent="submit" @keydown="handleKeydown">
    <p v-if="progress" class="text-sm text-muted-foreground" data-testid="goal-record-method">
      <span v-if="currentKeyResult?.title">{{ currentKeyResult.title }} · </span>
      {{ getKeyResultCalculationLabel(progress.aggregationMethod, t) }}
    </p>
    <div class="space-y-2">
      <Label for="change-amount">{{ recordPromptLabel }}</Label>
      <div class="relative flex items-center">
        <component
          :is="recordInputKind === 'delta' ? Diff : Ruler"
          class="absolute left-3 h-4 w-4 text-muted-foreground"
        />
        <Input
          id="change-amount"
          v-model.number="draft.value"
          type="number"
          class="h-11 pl-9 pr-16 text-lg font-semibold"
          step="any"
          :disabled="disabled"
        />
        <Badge v-if="currentKeyResultUnit" variant="secondary" class="absolute right-3 font-medium">
          {{ currentKeyResultUnit }}
        </Badge>
      </div>
      <p class="text-xs text-muted-foreground">
        {{
          t(
            recordInputKind === 'delta'
              ? 'goal.recordDialog.deltaHelp'
              : 'goal.recordDialog.sampleHelp',
          )
        }}
      </p>
      <p v-if="validationError" class="text-xs text-destructive">{{ validationError }}</p>
    </div>

    <div
      v-if="recordInputKind === 'delta'"
      class="flex flex-wrap gap-2"
      :aria-label="t('goal.recordDialog.quickSelect')"
    >
      <ProductPropertyChip
        v-for="quickValue in quickValues"
        :key="quickValue"
        :active="draft.value === quickValue"
        :disabled="disabled"
        :data-testid="`quick-goal-record-${quickValue}`"
        :aria-label="`${t('goal.recordDialog.quickSelect')} ${quickValue}`"
        @click="draft.value = quickValue"
      >
        {{ quickValue > 0 ? `+${quickValue}` : quickValue }}
      </ProductPropertyChip>
    </div>

    <GoalRecordPreview :preview="recordPreview" :unit="currentKeyResultUnit" />

    <div class="space-y-2">
      <Label for="record-note">{{ t('goal.recordDialog.remarks') }}</Label>
      <Textarea
        id="record-note"
        v-model="draft.note"
        :placeholder="t('goal.recordDialog.remarksPlaceholder')"
        :rows="3"
        maxlength="500"
        :disabled="disabled"
        class="resize-none"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { previewGoalRecord } from '@memoflow/goal/client';
import type { GoalRecordPreviewContext } from '@memoflow/contracts/goal';
import { Badge, Input, Label, Textarea } from '@memoflow/ui-vue-shadcn';
import { Diff, Ruler } from '@lucide/vue';
import { ProductPropertyChip } from '../../../shared/components';
import GoalRecordPreview from './GoalRecordPreview.vue';
import { useGoal } from '../composables/useGoal';
import {
  KEY_RESULT_CALCULATION_PRESENTATION,
  getKeyResultRecordPromptLabel,
  getKeyResultCalculationLabel,
} from '../utils/key-result-calculation-presentation';

const props = withDefaults(
  defineProps<{
    goalId: string;
    keyResultId: string;
    initialValue?: number | null;
    initialNote?: string;
    editing?: boolean;
    disabled?: boolean;
  }>(),
  { initialValue: null, initialNote: '', editing: false, disabled: false },
);
const emit = defineEmits<{
  submit: [intent: { value: number; note: string }];
  cancel: [];
  'validity-change': [valid: boolean];
  'dirty-change': [dirty: boolean];
}>();
const { t } = useI18n();
const { getKeyResultById, getGoalRecordPreviewContext } = useGoal();
const draft = ref<{ value: number | string; note: string }>({
  value: props.initialValue ?? '',
  note: props.initialNote,
});
const previewContext = ref<GoalRecordPreviewContext | null>(null);
const quickValues = [-10, -5, -1, 1, 5, 10];
// The owner read carries the aggregation snapshot, including tracking seed. A host cache is not required.
watch(
  () => [props.goalId, props.keyResultId],
  async (_, __, onCleanup) => {
    let active = true;
    onCleanup(() => {
      active = false;
    });
    previewContext.value = null;
    try {
      const context = await getGoalRecordPreviewContext(props.goalId, props.keyResultId);
      if (active) previewContext.value = context;
    } catch {
      /* Preview unavailable; host can still complete without measurement. */
    }
  },
  { immediate: true },
);
const currentKeyResult = computed(() => getKeyResultById(props.keyResultId));
const progress = computed(() => previewContext.value ?? currentKeyResult.value?.progress);
const currentKeyResultUnit = computed(() => progress.value?.unit);
const recordInputKind = computed(() => {
  const method = progress.value?.aggregationMethod;
  return method ? KEY_RESULT_CALCULATION_PRESENTATION[method].recordInputKind : undefined;
});
const recordPromptLabel = computed(() => {
  const method = progress.value?.aggregationMethod;
  return method ? getKeyResultRecordPromptLabel(method, t) : t('goal.recordDialog.recordedValue');
});
const validationError = computed(() =>
  typeof draft.value.value === 'number' && Number.isFinite(draft.value.value)
    ? ''
    : t('goal.recordDialog.valueFinite'),
);
const isValid = computed(
  () => !!progress.value && !validationError.value && draft.value.note.length <= 500,
);
watch(isValid, (valid) => emit('validity-change', valid), { immediate: true });
const isDirty = computed(
  () => draft.value.value !== (props.initialValue ?? '') || draft.value.note !== props.initialNote,
);
watch(isDirty, (dirty) => emit('dirty-change', dirty), { immediate: true });
const recordPreview = computed(() => {
  if (
    !previewContext.value ||
    !isValid.value ||
    typeof draft.value.value !== 'number' ||
    props.editing
  )
    return null;
  return previewGoalRecord(previewContext.value, draft.value.value);
});
function submit() {
  if (props.disabled || !isValid.value || typeof draft.value.value !== 'number') return;
  emit('submit', { value: draft.value.value, note: draft.value.note });
}
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    if (!props.disabled) emit('cancel');
    return;
  }
  if (event.key !== 'Enter') return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest('textarea, [contenteditable="true"], [aria-multiline="true"], button')
  )
    return;
  event.preventDefault();
  submit();
}
defineExpose({ submit });
</script>
