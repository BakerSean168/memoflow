<template>
  <section
    class="overflow-hidden rounded-xl border border-border/70 bg-background/20"
    data-testid="goal-key-results-editor"
  >
    <div class="flex min-h-11 items-center justify-between gap-3 px-3">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="text-sm font-medium">{{ t('goal.dialog.keyResults') }}</h3>
        <span v-if="keyResults.length" class="text-xs tabular-nums text-muted-foreground">
          {{ keyResults.length }}
        </span>
      </div>
      <Button
        v-if="!keyResults.length && !editorOpen"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-8 w-8 text-muted-foreground hover:text-foreground"
        :aria-label="t('goal.dialog.addKeyResult')"
        :disabled="disabled"
        data-testid="add-key-result-entry"
        @click="openAddKeyResult"
      >
        <Plus class="h-4 w-4" />
      </Button>
    </div>

    <div v-if="keyResults.length" class="border-t border-border/60">
      <div
        v-for="(keyResult, index) in keyResults"
        :key="keyResult.id ?? `new-${index}`"
        class="flex min-h-11 items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/25"
        :class="index > 0 ? 'border-t border-border/50' : ''"
        data-testid="goal-key-result-draft-row"
      >
        <button
          type="button"
          class="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :disabled="disabled || editorOpen"
          @click="openEditKeyResult(index)"
        >
          <div class="flex min-w-0 items-center gap-3">
            <p class="min-w-0 flex-1 truncate text-sm font-medium">{{ keyResult.title }}</p>

            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
              {{ keyResult.currentValue ?? keyResult.initialValue }} → {{ keyResult.targetValue }}
              <span v-if="keyResult.unit"> {{ keyResult.unit }}</span>
            </span>

            <span
              class="shrink-0 text-[11px] text-muted-foreground/80"
              data-testid="goal-key-result-draft-calculation"
            >
              {{ calculationMethodLabel(keyResult.calculationMethod) }}
            </span>

            <span
              class="ml-auto flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
              data-testid="goal-key-result-draft-target"
            >
              <CalendarDays class="h-3.5 w-3.5 opacity-70" />
              {{ compactTargetLabel(keyResult) }}
            </span>
          </div>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
          :aria-label="t('common.delete')"
          :disabled="disabled || editorOpen"
          @click="removeKeyResult(index)"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div
      v-if="keyResults.length && !editorOpen"
      class="flex justify-end border-t border-border/60 px-2 py-1.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        :disabled="disabled"
        data-testid="add-key-result-entry"
        @click="openAddKeyResult"
      >
        <Plus class="h-3.5 w-3.5" />
        {{ t('goal.dialog.addKeyResult') }}
      </Button>
    </div>

    <Transition name="kr-editor-reveal" @after-enter="ensureEditorFullyVisible">
      <div v-if="editorOpen" class="grid grid-rows-[1fr]" data-testid="key-result-draft-form">
        <div class="min-h-0 overflow-hidden">
          <div
            ref="editorPanelRef"
            class="space-y-4 border-t border-border/60 p-4"
            data-testid="key-result-draft-panel"
          >
            <GoalKeyResultCardEditor
              v-model:title="form.title"
              v-model:description="form.description"
              v-model:initial-value="form.initialValue"
              v-model:current-value="currentValueModel"
              v-model:target-value="form.targetValue"
              v-model:target="form.target"
              v-model:calculation-method="form.calculationMethod"
              v-model:unit="form.unit"
              v-model:weight="form.weight"
              :goal-start="goalStart"
              :goal-target="goalTarget"
              :disabled="disabled"
            />

            <p v-if="formError" role="alert" class="text-xs text-destructive">{{ formError }}</p>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" @click="cancelEdit">
                {{ t('common.cancel') }}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="save-key-result-draft"
                :disabled="!canSave"
                @click="saveDraft"
              >
                {{ editingIndex === null ? t('goal.dialog.addKeyResult') : t('common.save') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDays, Plus, X } from '@lucide/vue';
import {
  goalTimeframeLabel,
  KeyResultCalculationMethod,
  type GoalTimeframe,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';
import { Button } from '@memoflow/ui-vue-shadcn';
import GoalKeyResultCardEditor from './GoalKeyResultCardEditor.vue';

type DraftKeyResult = NonNullable<UpdateGoalReq['keyResults']>[number];
type KrId = DraftKeyResult['id'];

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    goalStart?: GoalTimeframe | null;
    goalTarget?: GoalTimeframe | null;
  }>(),
  {
    disabled: false,
    goalStart: null,
    goalTarget: null,
  },
);
const keyResults = defineModel<DraftKeyResult[]>({ required: true });
const emit = defineEmits<{ 'editing-change': [boolean] }>();
const { t, locale } = useI18n();

const editorOpen = ref(false);
const editorPanelRef = ref<HTMLElement | null>(null);
const editingIndex = ref<number | null>(null);
const formError = ref<string | null>(null);
const currentFollowsInitial = ref(true);
const form = reactive({
  id: undefined as KrId | undefined,
  title: '',
  description: '',
  initialValue: 0,
  currentValue: 0,
  targetValue: '' as number | '',
  target: null as GoalTimeframe | null,
  calculationMethod: KeyResultCalculationMethod.Sum as KeyResultCalculationMethod,
  unit: '',
  weight: 3,
});

const canSave = computed(
  () =>
    form.title.trim().length > 0 &&
    form.targetValue !== '' &&
    Number.isFinite(Number(form.initialValue)) &&
    Number.isFinite(Number(form.currentValue)) &&
    Number.isFinite(Number(form.targetValue)),
);
const currentValueModel = computed({
  get: () => form.currentValue,
  set: (value: number) => {
    currentFollowsInitial.value = false;
    form.currentValue = value;
  },
});

watch(
  editorOpen,
  (open) => {
    emit('editing-change', open);
    if (open) scheduleEditorVisibilityCheck();
  },
  { immediate: true },
);
watch(
  () => form.initialValue,
  (value) => {
    if (currentFollowsInitial.value) form.currentValue = Number(value);
  },
);

function resetForm(): void {
  form.id = undefined;
  form.title = '';
  form.description = '';
  form.initialValue = 0;
  form.currentValue = 0;
  form.targetValue = '';
  form.target = null;
  form.calculationMethod = KeyResultCalculationMethod.Sum;
  form.unit = '';
  form.weight = 3;
  formError.value = null;
  currentFollowsInitial.value = true;
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
  if (!scrollContainer) return;

  if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1) return;

  const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  if (typeof scrollContainer.scrollTo !== 'function') return;
  scrollContainer.scrollTo({
    top: maxScrollTop,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
}

function openAddKeyResult(): void {
  if (props.disabled || editorOpen.value) return;
  resetForm();
  editingIndex.value = null;
  editorOpen.value = true;
}

function openEditKeyResult(index: number): void {
  if (props.disabled || editorOpen.value) return;
  const keyResult = keyResults.value[index];
  if (!keyResult) return;
  resetForm();
  editingIndex.value = index;
  form.id = keyResult.id;
  form.title = keyResult.title;
  form.description = keyResult.description ?? '';
  form.initialValue = keyResult.initialValue;
  form.currentValue = keyResult.currentValue ?? keyResult.initialValue;
  form.targetValue = keyResult.targetValue;
  form.target = keyResult.target ? { ...keyResult.target } : null;
  form.calculationMethod = keyResult.calculationMethod;
  form.unit = keyResult.unit ?? '';
  form.weight = keyResult.weight;
  currentFollowsInitial.value = false;
  editorOpen.value = true;
}

function cancelEdit(): void {
  editorOpen.value = false;
  editingIndex.value = null;
  resetForm();
}

function validateMeasurement(): boolean {
  formError.value = null;
  const initial = Number(form.initialValue);
  const current = Number(form.currentValue);
  const target = Number(form.targetValue);
  if (![initial, current, target].every(Number.isFinite)) {
    formError.value = t('common.operationFailed');
    return false;
  }
  if (initial === target) {
    formError.value = t('goal.dialog.krInitialTargetConflict');
    return false;
  }
  return true;
}

function saveDraft(): void {
  if (!canSave.value || !validateMeasurement()) return;
  const current = Number(form.currentValue);
  const next: DraftKeyResult = {
    ...(form.id ? { id: form.id } : {}),
    title: form.title.trim(),
    description: form.description.trim() || null,
    calculationMethod: form.calculationMethod,
    initialValue: Number(form.initialValue),
    currentValue: current,
    targetValue: Number(form.targetValue),
    target: form.target,
    unit: form.unit.trim() || null,
    weight: Math.max(1, Math.min(5, Math.round(Number(form.weight) || 3))),
  };
  if (editingIndex.value === null) keyResults.value = [...keyResults.value, next];
  else {
    const updated = [...keyResults.value];
    updated.splice(editingIndex.value, 1, next);
    keyResults.value = updated;
  }
  cancelEdit();
}

function removeKeyResult(index: number): void {
  if (props.disabled || editorOpen.value) return;
  keyResults.value = keyResults.value.filter((_, itemIndex) => itemIndex !== index);
}

function calculationMethodLabel(method: KeyResultCalculationMethod): string {
  const labels: Record<KeyResultCalculationMethod, string> = {
    Sum: t('goal.dialog.krCalculationSum'),
    Average: t('goal.dialog.krCalculationAverage'),
    Max: t('goal.dialog.krCalculationMax'),
    Min: t('goal.dialog.krCalculationMin'),
    Last: t('goal.dialog.krCalculationLast'),
  };
  return labels[method];
}

function compactTargetLabel(keyResult: DraftKeyResult): string {
  const target = keyResult.target ?? props.goalTarget;
  return target ? goalTimeframeLabel(target, locale.value) : t('goal.dialog.krTrajectoryNotSet');
}
</script>

<style scoped>
.kr-editor-reveal-enter-active,
.kr-editor-reveal-leave-active {
  transform-origin: bottom;
  transition:
    grid-template-rows 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease-out,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.kr-editor-reveal-enter-from,
.kr-editor-reveal-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
  transform: translateY(6px);
}

.kr-editor-reveal-enter-to,
.kr-editor-reveal-leave-from {
  grid-template-rows: 1fr;
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .kr-editor-reveal-enter-active,
  .kr-editor-reveal-leave-active {
    transition-duration: 0.01ms;
  }

  .kr-editor-reveal-enter-from,
  .kr-editor-reveal-leave-to,
  .kr-editor-reveal-enter-to,
  .kr-editor-reveal-leave-from {
    transform: none;
  }
}
</style>
