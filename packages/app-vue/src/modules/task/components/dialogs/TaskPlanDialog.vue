<template>
  <Dialog :open="visible" @update:open="setVisible">
    <ProductDialogShell
      :open="visible"
      test-id="task-plan-dialog"
      size="lg"
      initial-focus-selector="[data-testid='task-plan-title-input']"
    >
      <template #icon>
        <component
          :is="mode === 'edit' ? Pencil : mode === 'copy' ? Copy : PlusCircle"
          :class="mode === 'edit' ? 'text-primary' : 'text-success'"
          class="mt-0.5 h-5 w-5 shrink-0"
        />
      </template>
      <template #title>
        {{
          mode === 'edit'
            ? t('task.templateDialog.editTitle')
            : mode === 'copy'
              ? t('task.templateDialog.copyTitle')
              : t('task.templateDialog.createTitle')
        }}
      </template>
      <template #description>
        {{
          mode === 'edit'
            ? t('task.templateDialog.editSubtitle')
            : mode === 'copy'
              ? t('task.templateDialog.copySubtitle')
              : t('task.templateDialog.createSubtitle')
        }}
      </template>

      <template #status>
        <p
          v-if="mode === 'edit' && (localTemplate?.futurePendingInstanceCount ?? 0) > 0"
          class="mx-6 mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-foreground"
          role="status"
          data-testid="task-plan-update-impact"
        >
          {{
            t('task.templateDialog.updateImpact', {
              count: localTemplate?.futurePendingInstanceCount ?? 0,
            })
          }}
        </p>
      </template>

      <TaskPlanForm
        v-if="localTemplate"
        ref="formRef"
        :model-value="localTemplate"
        :is-edit-mode="mode === 'edit'"
        :readonly="saving"
        :goals="goalOptions"
        :key-results-by-goal="keyResultsByGoal"
        :loading-goals="loadingGoals"
        :loading-key-results="loadingKeyResults"
        :key-result-errors-by-goal="keyResultErrorsByGoal"
        :on-request-key-results="requestKeyResults"
        @update:model-value="handleTemplateUpdate"
        @update:validation="handleValidationUpdate"
        @close="handleCancel"
      />

      <template #footer>
        <Button variant="ghost" :disabled="saving" @click="handleCancel">{{
          t('task.templateDialog.cancel')
        }}</Button>
        <Button
          data-testid="task-dialog-save-button"
          :disabled="!canSave"
          :loading="saving"
          @click="handleSave"
        >
          {{
            mode === 'edit' ? t('task.templateDialog.saveChanges') : t('task.templateDialog.create')
          }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dialog, Button } from '@memoflow/ui-vue-shadcn';
import { Copy, Pencil, PlusCircle } from '@lucide/vue';
import TaskPlanForm from '../TaskPlanForm/TaskPlanForm.vue';
import type { TaskPlanViewModel } from '../types';
import { TaskPlanScheduleSchema, TaskType } from '@memoflow/contracts/task';
import { getProductTime } from '../../../../shared/utils/product-time';
import { useTaskGoalBindingOptions } from '../../composables/useTaskGoalBindingOptions';
import { ProductDialogShell } from '../../../../shared/components';
import { useDialogDraftStore } from '../../../../layouts/shell/dialog-draft-store';

const { t } = useI18n();
const dialogDraftStore = useDialogDraftStore();
const {
  goals: goalOptions,
  keyResultsByGoal,
  loadingGoals,
  loadingKeyResults,
  keyResultErrorsByGoal,
  loadGoals: loadGoalOptions,
  loadKeyResults: loadGoalKeyResults,
  clearErrors: clearGoalBindingErrors,
} = useTaskGoalBindingOptions();

function createBlankTemplate(): TaskPlanViewModel {
  return {
    id: '',
    title: '',
    description: '',
    status: 'ACTIVE',
    isActive: true,
    isPaused: false,
    isArchived: false,
    importance: 'Moderate',
    labels: [],
    labelIds: [],
    goalBinding: null,
    schedule: TaskPlanScheduleSchema.parse({
      kind: 'OneTime',
      date: getProductTime().input.dateValue(Date.now()),
      timing: { kind: 'AllDay' },
    }),
    timeConfig: {
      timeType: 'AllDay',
      timePoint: null,
      timeRange: null,
      startDate: getProductTime().input.dateValue(Date.now()),
    },
    recurrenceRule: null,
    reminderConfig: null,
    instanceCount: 0,
    completionRate: 0,
    taskType: TaskType.OneTime,
  };
}

function cloneTemplate(template: TaskPlanViewModel): TaskPlanViewModel {
  return structuredClone(toCloneableData(template));
}

function toCloneableData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCloneableData(item)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const rawValue = toRaw(value);
    return Object.fromEntries(
      Object.entries(rawValue).map(([key, item]) => [key, toCloneableData(item)]),
    ) as T;
  }

  return value;
}

function createEditDraft(template: TaskPlanViewModel | null): TaskPlanViewModel | null {
  return template ? cloneTemplate(template) : null;
}

function createCopyDraft(template: TaskPlanViewModel | null): TaskPlanViewModel | null {
  if (!template) {
    return null;
  }

  return {
    ...cloneTemplate(template),
    id: '',
    status: 'ACTIVE',
    isActive: true,
    isPaused: false,
    isArchived: false,
    instanceCount: 0,
    completedInstanceCount: 0,
    pendingInstanceCount: 0,
    completionRate: 0,
    formattedCreatedAt: undefined,
  };
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    template?: TaskPlanViewModel | null;
    mode?: 'create' | 'edit' | 'copy';
    saving?: boolean;
  }>(),
  {
    template: null,
    mode: 'create',
    saving: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', value: TaskPlanViewModel): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
}>();

const formRef = ref<InstanceType<typeof TaskPlanForm> | null>(null);
const localTemplate = ref<TaskPlanViewModel | null>(null);
const draftBaseline = ref<string | null>(null);
const currentDraftKey = ref<string | null>(null);
const isValid = ref(false);
const visible = computed(() => props.modelValue);
const mode = computed(() => props.mode);
const saving = computed(() => props.saving);
const canSave = computed(() => !!localTemplate.value && isValid.value && !saving.value);
async function loadGoals() {
  await loadGoalOptions();
}

async function requestKeyResults(goalId: string, force = false) {
  return loadGoalKeyResults(goalId, force);
}

function initializeDraft(): void {
  if (props.mode === 'create') {
    localTemplate.value = createBlankTemplate();
  } else if (props.mode === 'copy') {
    localTemplate.value = createCopyDraft(props.template ?? null);
  } else {
    localTemplate.value = createEditDraft(props.template ?? null);
  }

  isValid.value = false;
  clearGoalBindingErrors();
  draftBaseline.value = JSON.stringify(localTemplate.value);
  emit('dirty-change', false);
}

function resolveDraftKey(): string {
  const scope = dialogDraftStore.scope?.value ?? 'standalone';
  return `${scope}:task-plan-dialog:${props.mode}:${props.template?.id ?? 'new'}`;
}

function clearDraft(): void {
  if (currentDraftKey.value) dialogDraftStore.clear(currentDraftKey.value);
}

watch(
  localTemplate,
  (draft) => {
    if (!visible.value || draftBaseline.value === null) return;
    const serialized = JSON.stringify(draft);
    if (draft && currentDraftKey.value && serialized !== draftBaseline.value) {
      dialogDraftStore.save(currentDraftKey.value, {
        draft: cloneTemplate(draft),
        baseline: draftBaseline.value,
      });
    } else if (currentDraftKey.value) {
      dialogDraftStore.clear(currentDraftKey.value);
    }
    emit('dirty-change', serialized !== draftBaseline.value);
  },
  { deep: true },
);

watch(
  visible,
  async (open, wasOpen) => {
    if (!open) {
      clearDraft();
      draftBaseline.value = null;
      emit('dirty-change', false);
      return;
    }

    if (!wasOpen) {
      currentDraftKey.value = resolveDraftKey();
      const saved = dialogDraftStore.load<{
        draft: TaskPlanViewModel;
        baseline: string;
      }>(currentDraftKey.value);
      if (saved) {
        localTemplate.value = saved.draft;
        draftBaseline.value = saved.baseline;
      } else {
        initializeDraft();
      }
    }
    await loadGoals();
  },
  { immediate: true },
);

watch(
  [() => props.mode, () => props.template?.id],
  ([nextMode, nextTemplateId], [previousMode, previousTemplateId]) => {
    if (visible.value && (nextMode !== previousMode || nextTemplateId !== previousTemplateId)) {
      initializeDraft();
    }
  },
);

const setVisible = (value: boolean) => {
  if (!value && saving.value) return;
  if (!value) clearDraft();
  emit('update:modelValue', value);
};

const handleTemplateUpdate = (value: TaskPlanViewModel) => {
  localTemplate.value = value;
};

const handleValidationUpdate = (validation: { isValid: boolean }) => {
  isValid.value = validation.isValid;
};

const handleCancel = () => {
  if (saving.value) return;
  clearDraft();
  localTemplate.value = null;
  draftBaseline.value = null;
  isValid.value = false;
  clearGoalBindingErrors();
  emit('dirty-change', false);
  emit('cancel');
  emit('update:modelValue', false);
};

const handleSave = () => {
  if (!localTemplate.value || !canSave.value) return;
  emit('save', localTemplate.value);
};
</script>
