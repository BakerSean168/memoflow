<template>
  <Dialog :open="visible" @update:open="setVisible">
    <ProductDialogShell
      :open="visible"
      test-id="task-plan-dialog"
      recipe="workspace"
      body-class="flex flex-col"
      initial-focus-selector="[data-testid='task-plan-title-input']"
    >
      <template #title>
        {{
          mode === 'edit'
            ? t('task.templateDialog.editTitle')
            : mode === 'copy'
              ? t('task.templateDialog.copyTitle')
              : t('task.templateDialog.createTitle')
        }}
      </template>
      <template #status>
        <p
          v-if="mode === 'edit' && (localTemplate?.futurePendingOccurrenceCount ?? 0) > 0"
          class="mx-6 mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-foreground"
          role="status"
          data-testid="task-plan-update-impact"
        >
          {{
            t('task.templateDialog.updateImpact', {
              count: localTemplate?.futurePendingOccurrenceCount ?? 0,
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
        @submit="handleSave"
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
import {
  computed,
  ref,
  toRaw,
  watch,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  onActivated,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { Dialog, Button } from '@memoflow/ui-vue-shadcn';
import TaskPlanForm from '../TaskPlanForm/TaskPlanForm.vue';
import type { TaskPlanViewModel } from '../types';
import { buildTaskPlanCreateRequest } from '../../utils/task-plan-create-request';
import type {
  TaskNativeEditSession,
  TaskNativeSubmitContext,
} from '../../composables/taskNativeEditSession';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { useLabelCatalog } from '../../../../shared/composables/useLabelCatalog';
import { TaskPlanScheduleSchema } from '@memoflow/contracts/task';
import { getProductTime } from '../../../../shared/utils/product-time';
import { useTaskGoalBindingOptions } from '../../composables/useTaskGoalBindingOptions';
import { ProductDialogShell } from '../../../../shared/components';
import { useDialogDraftStore } from '../../../../layouts/shell/dialog-draft-store';
import { useDialogCloseGuard } from '../../../../shared/composables/useDialogCloseGuard';

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
    goalBinding: props.initialGoalBinding ? structuredClone(props.initialGoalBinding) : null,
    checklist: [],
    schedule: TaskPlanScheduleSchema.parse({
      kind: 'OneTime',
      date: getProductTime().input.dateValue(Date.now()),
      timing: { kind: 'AllDay' },
    }),
    reminderConfig: null,
    occurrenceCount: 0,
    completionRate: 0,
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
    occurrenceCount: 0,
    completedOccurrenceCount: 0,
    pendingOccurrenceCount: 0,
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
    submitOwner?: (
      draft: TaskPlanViewModel,
      context?: TaskNativeSubmitContext,
    ) => Promise<TaskPlanClientDTO | null>;
    initialGoalBinding?: TaskPlanViewModel['goalBinding'];
  }>(),
  {
    template: null,
    mode: 'create',
    saving: false,
    initialGoalBinding: null,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', value: TaskPlanViewModel): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
  (e: 'busy-change', busy: boolean): void;
  (e: 'session-change', session: TaskNativeEditSession | null): void;
}>();

const formRef = ref<InstanceType<typeof TaskPlanForm> | null>(null);
const localTemplate = ref<TaskPlanViewModel | null>(null);
const draftBaseline = ref<string | null>(null);
const currentDraftKey = ref<string | null>(null);
const isValid = ref(false);
const visible = computed(() => props.modelValue);
const mode = computed(() => props.mode);
const submitting = ref(false);
const editingBlocked = ref(false);
const saving = computed(() => props.saving || submitting.value || editingBlocked.value);
const isDirty = computed(
  () =>
    visible.value &&
    draftBaseline.value !== null &&
    JSON.stringify(localTemplate.value) !== draftBaseline.value,
);
const { resolveNames } = useLabelCatalog();
let submitCoordinator: (() => Promise<void>) | null = null;
let cancelCoordinator: (() => Promise<void>) | null = null;
let invalidateSession: (() => void) | null = null;
watch(saving, (busy) => emit('busy-change', busy), { immediate: true });
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
  const createBindingKey =
    props.mode === 'create' && props.initialGoalBinding?.goalId
      ? `:${props.initialGoalBinding.goalId}:${props.initialGoalBinding.keyResultId ?? 'goal'}`
      : '';
  return `${scope}:task-plan-dialog:${props.mode}:${props.template?.id ?? 'new'}${createBindingKey}`;
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
    emit('dirty-change', isDirty.value);
  },
  { deep: true },
);

watch(
  visible,
  async (open, wasOpen) => {
    if (!open) {
      retireSession();
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
    if (!wasOpen) publishSession();
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

async function closeNow(): Promise<void> {
  if (cancelCoordinator) {
    await cancelCoordinator();
    return;
  }
  cancelOwner();
}

const { requestClose } = useDialogCloseGuard({
  dirty: isDirty,
  busy: saving,
  onClose: closeNow,
});

const setVisible = (value: boolean) => {
  if (!value) void requestClose();
};

const handleTemplateUpdate = (value: TaskPlanViewModel) => {
  if (saving.value) return;
  localTemplate.value = cloneTemplate(value);
};

const handleValidationUpdate = (validation: { isValid: boolean }) => {
  isValid.value = validation.isValid;
};

const handleCancel = () => {
  void requestClose();
};

function cancelOwner() {
  retireSession();
  clearDraft();
  localTemplate.value = null;
  draftBaseline.value = null;
  isValid.value = false;
  clearGoalBindingErrors();
  emit('dirty-change', false);
  emit('cancel');
  emit('update:modelValue', false);
}

const handleSave = async () => {
  if (!canSave.value) return;
  if (submitCoordinator) return submitCoordinator();
  if (props.submitOwner) await saveOwner();
  else if (localTemplate.value) emit('save', cloneTemplate(localTemplate.value));
};

async function saveOwner(context?: TaskNativeSubmitContext): Promise<TaskPlanClientDTO | null> {
  if (!localTemplate.value || !canSave.value || !formRef.value?.validate()) return null;
  const draft = cloneTemplate(localTemplate.value);
  if (context && JSON.stringify(draft) !== JSON.stringify(context.expectedDraft))
    throw new Error('Task draft changed while saving workflow revision');
  if (!props.submitOwner) throw new Error('Task owner submission is unavailable');
  buildTaskPlanCreateRequest(draft, context?.createId);
  submitting.value = true;
  try {
    // Native form validation precedes label commands and owner persistence.
    if (context?.pendingLabelNames.length) {
      draft.labelIds = [
        ...new Set([...(draft.labelIds ?? []), ...(await resolveNames(context.pendingLabelNames))]),
      ];
    }
    return await props.submitOwner(draft, context);
  } finally {
    submitting.value = false;
  }
}

function retireSession(): void {
  invalidateSession?.();
  invalidateSession = null;
  submitCoordinator = null;
  cancelCoordinator = null;
  editingBlocked.value = false;
  emit('session-change', null);
}
function publishSession(): void {
  retireSession();
  if (props.mode !== 'create') return;
  let active = true;
  invalidateSession = () => {
    active = false;
  };
  function assertActive() {
    if (!active || !visible.value || !localTemplate.value)
      throw new Error('Task edit session is closed');
  }
  function assertEditable() {
    assertActive();
    if (saving.value) throw new Error('Task edit session is busy');
  }
  const session: TaskNativeEditSession = {
    patch(changes) {
      assertEditable();
      const fields = [
        'title',
        'description',
        'schedule',
        'reminderConfig',
        'importance',
        'labelIds',
        'goalBinding',
        'checklist',
      ] as const;
      const next = cloneTemplate(localTemplate.value!);
      for (const field of fields)
        if (changes[field] !== undefined)
          Object.assign(next, { [field]: toCloneableData(changes[field]) });
      localTemplate.value = cloneTemplate(next);
    },
    async focus() {
      assertActive();
      await nextTick();
      assertActive();
      const form: HTMLFormElement | undefined = formRef.value?.formRef;
      form?.querySelector<HTMLTextAreaElement>('[data-testid=task-plan-title-input]')?.focus();
    },
    readDraftState() {
      assertActive();
      return {
        draft: cloneTemplate(localTemplate.value!),
        dirty: JSON.stringify(localTemplate.value) !== draftBaseline.value,
        busy: saving.value,
      };
    },
    coordinateSubmit(submit, cancel) {
      assertEditable();
      submitCoordinator = submit;
      cancelCoordinator = cancel;
    },
    setEditingBlocked(blocked) {
      assertActive();
      editingBlocked.value = blocked;
    },
    requestSubmit(context) {
      assertEditable();
      if (submitCoordinator && !context)
        throw new Error('Coordinated Task submit requires owner context');
      return saveOwner(context);
    },
    requestCancel() {
      assertEditable();
      cancelOwner();
    },
  };
  emit('session-change', session);
}
onBeforeUnmount(retireSession);
onDeactivated(retireSession);
onActivated(() => {
  if (visible.value && !invalidateSession) publishSession();
});
</script>
