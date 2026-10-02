<template>
  <Dialog :open="open" @update:open="setOpen">
    <ProductDialogShell
      :open="open"
      test-id="goal-dialog"
      recipe="workspace"
      initial-focus-selector="[data-testid='goal-name-input']"
    >
      <template #title>
        {{ mode === 'edit' ? t('goal.dialog.editGoal') : t('goal.dialog.createGoal') }}
      </template>
      <template #actions>
        <Button
          v-if="mode === 'create'"
          type="button"
          variant="ghost"
          size="sm"
          :disabled="isBusy"
          data-testid="goal-create-with-ai"
          @click="emit('create-with-ai')"
        >
          <Sparkles class="mr-1 h-4 w-4" />
          {{ t('goal.dialog.createWithAI') }}
        </Button>
      </template>

      <form id="goal-form" class="flex min-h-full flex-col gap-6" @submit.prevent="save">
        <section
          class="space-y-4 border-b border-[hsl(var(--border-subtle))] pb-5"
          data-testid="goal-identity-section"
        >
          <div>
            <Label for="goal-name" class="sr-only">{{ t('goal.dialog.goalTitle') }}</Label>
            <ProductAutoTextarea
              id="goal-name"
              ref="nameInput"
              v-model="draft.name"
              :disabled="isBusy"
              :max-length="80"
              :rows="1"
              data-testid="goal-name-input"
              class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
              :placeholder="t('goal.dialog.goalTitlePlaceholder')"
              @limit-exceeded="nameLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="nameLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
                data-testid="goal-name-limit-error"
              >
                {{ t('goal.dialog.nameLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div>
            <Label for="goal-summary" class="sr-only">{{ t('goal.dialog.summary') }}</Label>
            <ProductAutoTextarea
              id="goal-summary"
              ref="summaryInput"
              v-model="draft.summary"
              :disabled="isBusy"
              :max-length="255"
              :rows="1"
              data-testid="goal-summary-input"
              class="min-h-8 text-sm leading-5 text-muted-foreground"
              :placeholder="t('goal.dialog.summaryPlaceholder')"
              @limit-exceeded="summaryLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="summaryLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
                data-testid="goal-summary-limit-error"
              >
                {{ t('goal.dialog.summaryLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div class="flex flex-wrap items-center gap-2" data-testid="goal-property-chips">
            <GoalStatusPicker
              v-model="draft.status"
              :base-status="persistedStatus"
              :disabled="isBusy"
            />
            <GoalTimeframePicker
              v-model="draft.start"
              :disabled="isBusy"
              :label="t('goal.dialog.startDate')"
              test-id="goal-start-chip"
              :aria-label="t('goal.dialog.startDate')"
              :placeholder="t('goal.dialog.startDate')"
              :max-start-boundary="
                draft.target ? goalTimeframeEndBoundary(draft.target) : undefined
              "
              :constraint-text="t('goal.dialog.startAfterTarget')"
            />

            <GoalTimeframePicker
              v-model="draft.target"
              :disabled="isBusy"
              test-id="goal-target-chip"
              :aria-label="t('goal.dialog.target')"
              :placeholder="t('goal.dialog.target')"
              :min-end-boundary="draft.start ? goalTimeframeStartBoundary(draft.start) : undefined"
              :constraint-text="t('goal.dialog.targetBeforeStart')"
            />

            <LabelPicker
              v-model="draft.labelIds"
              :options="labelOptions"
              :disabled="labelsLoading || isBusy"
              :placeholder="t('goal.dialog.labels')"
              :search-placeholder="t('goal.list.searchLabels')"
              :empty-text="t('goal.list.noLabels')"
              :create-label="t('goal.dialog.createLabel')"
              :aria-label="t('goal.dialog.labels')"
              compact
              @create="createAndSelectLabel"
            />

            <GoalReminderChip
              v-if="mode === 'edit'"
              v-model="draft.reminderConfig"
              :disabled="isBusy"
              :start="draft.start"
              :target="draft.target"
            />

            <Popover>
              <PopoverTrigger as-child>
                <ProductPropertyChip data-testid="goal-notes-chip">
                  <template #icon><NotebookText class="h-3.5 w-3.5" /></template>
                  {{ t('goal.dialog.notes') }}
                </ProductPropertyChip>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-72 space-y-3 p-3">
                <p class="text-sm text-muted-foreground">{{ t('goal.dialog.notesHint') }}</p>
                <Button
                  v-if="mode === 'edit' && goal"
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="isBusy"
                  data-testid="goal-notes-open-knowledge"
                  @click="emit('open-knowledge', String(goal.id))"
                >
                  {{ t('goal.dialog.openKnowledge') }}
                </Button>
                <Button
                  v-else
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="isBusy"
                  data-testid="goal-notes-create-with-ai"
                  @click="emit('create-with-ai')"
                >
                  <Sparkles class="mr-1 h-4 w-4" />
                  {{ t('goal.dialog.createWithAI') }}
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          <p v-if="labelCreateError" role="alert" class="text-xs text-destructive">
            {{ labelCreateError }}
          </p>
          <p v-if="formError" role="alert" class="text-xs text-destructive">
            {{ formError }}
          </p>
        </section>

        <section class="space-y-2" data-testid="goal-description-section">
          <Label for="goal-description" class="sr-only">{{ t('goal.dialog.description') }}</Label>
          <ProductAutoTextarea
            id="goal-description"
            ref="descriptionInput"
            v-model="draft.description"
            :disabled="isBusy"
            :max-length="10000"
            :rows="5"
            data-testid="goal-description-input"
            class="min-h-32 text-sm leading-6 text-foreground/90"
            :placeholder="t('goal.dialog.descriptionLongPlaceholder')"
            @limit-exceeded="descriptionLimitFeedback.show()"
          />
          <Transition
            enter-active-class="transition-opacity duration-150"
            leave-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <p
              v-if="descriptionLimitFeedback.visible.value"
              class="text-xs text-destructive"
              role="alert"
              data-testid="goal-description-limit-error"
            >
              {{ t('goal.dialog.descriptionLimitExceeded') }}
            </p>
          </Transition>
        </section>

        <GoalKeyResultDraftEditor
          :key="mode"
          v-model="draft.keyResults"
          class="mt-auto"
          :disabled="isBusy"
          :goal-start="draft.start"
          :goal-target="draft.target"
          @editing-change="krEditorOpen = $event"
        />
      </form>

      <template #footer>
        <Button variant="ghost" :disabled="isBusy" @click="setOpen(false)">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="goal-form"
          data-testid="save-goal-button"
          :disabled="!draft.name.trim() || isBusy || krEditorOpen"
        >
          {{ mode === 'edit' ? t('goal.dialog.saveChanges') : t('goal.dialog.createGoal') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  reactive,
  ref,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { NotebookText, Sparkles } from '@lucide/vue';
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  GoalStatus,
  ReminderTriggerType,
  goalTimeframeEndBoundary,
  goalTimeframeStartBoundary,
  type GoalStatus as GoalStatusValue,
  type GoalReminderConfigDTO,
  type GoalClientDTO,
  type GoalTimeframe,
  type CreateGoalReq,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';
import {
  Button,
  Dialog,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import {
  LabelPicker,
  ProductAutoTextarea,
  ProductDialogShell,
  ProductPropertyChip,
} from '../../../../shared/components';
import GoalReminderChip from '../GoalReminderChip.vue';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';
import GoalStatusPicker from '../GoalStatusPicker.vue';
import GoalKeyResultDraftEditor from '../GoalKeyResultDraftEditor.vue';
import { useLabelCatalog } from '../../../../shared/composables/useLabelCatalog';
import { isGoalStatusTransitionAllowed } from '../../composables/goalStatusTransitions';
import { useGoal } from '../../composables/useGoal';
import { useTransientFeedback } from '../../../../shared/composables/useTransientFeedback';

import type {
  GoalDraftKeyResult as DraftKeyResult,
  GoalNativeDraft,
  GoalNativeSubmitContext,
  GoalNativeEditSession,
} from '../../composables/goalNativeEditSession';

const props = withDefaults(
  defineProps<{ open: boolean; mode?: 'create' | 'edit'; goal?: GoalClientDTO | null }>(),
  { mode: 'create', goal: null },
);
const emit = defineEmits<{
  'session-change': [session: GoalNativeEditSession | null];
  'update:open': [boolean];
  created: [GoalClientDTO];
  updated: [GoalClientDTO];
  'dirty-change': [boolean];
  'busy-change': [boolean];
  'create-with-ai': [];
  'open-knowledge': [goalId: string];
}>();

const { t } = useI18n();
const { createGoal, updateGoal, transitionGoalStatus, isSaving } = useGoal();
const submitting = ref(false);
const editingBlocked = ref(false);
const isBusy = computed(() => submitting.value || isSaving.value || editingBlocked.value);
watch(isBusy, (busy) => emit('busy-change', busy), { immediate: true, flush: 'sync' });
const {
  options: labelOptions,
  isLoading: labelsLoading,
  createLabel,
  resolveNames,
} = useLabelCatalog();

const draft = reactive<GoalNativeDraft>({
  name: '',
  summary: '',
  description: '',
  status: GoalStatus.Planned as GoalStatusValue,
  start: null as GoalTimeframe | null,
  target: null as GoalTimeframe | null,
  reminderConfig: null as GoalReminderConfigDTO | null,
  labelIds: [] as string[],
  keyResults: [] as DraftKeyResult[],
});
const nameInput = ref<{ $el: HTMLTextAreaElement } | null>(null);
const summaryInput = ref<{ $el: HTMLTextAreaElement } | null>(null);
const descriptionInput = ref<{ $el: HTMLTextAreaElement } | null>(null);
let submitCoordinator: (() => Promise<void>) | null = null;
let invalidateSession: (() => void) | null = null;

// Only JSON value fields enter this owner contract; detach inbound and outbound values.
function copyValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function publishSession(): void {
  invalidateSession?.();
  let active = true;
  invalidateSession = () => {
    active = false;
  };
  function assertActive(): void {
    if (!active || !props.open) throw new Error('Goal edit session is closed');
  }
  function assertEditable(): void {
    assertActive();
    if (isBusy.value) throw new Error('Goal edit session is busy');
  }
  const session: GoalNativeEditSession = {
    setEditingBlocked(blocked) {
      assertActive();
      editingBlocked.value = blocked;
    },
    patch(changes) {
      assertEditable();
      // Preflight the whole patch before touching the canonical draft.
      if (changes.keyResults && krEditorOpen.value)
        throw new Error('Finish the native Key Result editor first');
      if (changes.keyResult) {
        if (krEditorOpen.value) throw new Error('Finish the native Key Result editor first');
        const { index } = changes.keyResult;
        if (!Number.isInteger(index) || !(changes.keyResults ?? draft.keyResults)[index])
          throw new Error('Key Result position is invalid');
      }
      const detached = copyValue(changes);
      changes = detached;
      // Explicit field allowlist: arbitrary component state cannot be patched.
      if (changes.keyResults !== undefined) draft.keyResults = copyValue(changes.keyResults);
      if (changes.name !== undefined) draft.name = changes.name;
      if (changes.summary !== undefined) draft.summary = changes.summary;
      if (changes.description !== undefined) draft.description = changes.description;
      if (changes.status !== undefined) draft.status = changes.status;
      if (changes.start !== undefined) draft.start = copyValue(changes.start);
      if (changes.target !== undefined) draft.target = copyValue(changes.target);
      if (changes.reminderConfig !== undefined)
        draft.reminderConfig = copyValue(changes.reminderConfig);
      if (changes.labelIds !== undefined) draft.labelIds = [...changes.labelIds];
      if (changes.keyResult) {
        const { index, changes: childChanges } = changes.keyResult;
        const child = draft.keyResults[index];
        const fields = [
          'title',
          'description',
          'calculationMethod',
          'initialValue',
          'currentValue',
          'targetValue',
          'target',
          'unit',
          'weight',
        ] as const;
        for (const field of fields) {
          if (childChanges[field] !== undefined) {
            Object.assign(child, { [field]: copyValue(childChanges[field]) });
          }
        }
      }
    },
    addChild(child) {
      assertEditable();
      if (krEditorOpen.value) throw new Error('Finish the native Key Result editor first');
      const {
        id,
        title,
        description,
        calculationMethod,
        initialValue,
        currentValue,
        targetValue,
        target,
        unit,
        weight,
      } = child;
      draft.keyResults.push(
        copyValue({
          ...(id ? { id } : {}),
          title,
          description,
          calculationMethod,
          initialValue,
          currentValue,
          targetValue,
          target,
          unit,
          weight,
        }),
      );
    },
    removeChild(index) {
      assertEditable();
      if (krEditorOpen.value) throw new Error('Finish the native Key Result editor first');
      if (!Number.isInteger(index) || !draft.keyResults[index])
        throw new Error('Key Result position is invalid');
      draft.keyResults.splice(index, 1);
    },
    async focus(field) {
      assertActive();
      await nextTick();
      assertActive();
      const inputs = { name: nameInput, summary: summaryInput, description: descriptionInput };
      inputs[field].value?.$el.focus();
    },
    coordinateSubmit(coordinator) {
      assertEditable();
      if (props.mode !== 'create') throw new Error('Submission coordination requires create mode');
      submitCoordinator = coordinator;
    },
    async requestSubmit(context) {
      assertEditable();
      if (submitCoordinator && !context)
        throw new Error('Coordinated Goal submit requires owner context');
      return saveOwner(context);
    },
    requestCancel() {
      assertEditable();
      setOpen(false);
    },
    readDraftState() {
      assertActive();
      return {
        mode: props.mode,
        goalId: props.mode === 'edit' && props.goal ? String(props.goal.id) : null,
        draft: copyValue(draft),
        dirty: snapshotDraft() !== initialSnapshot.value,
        busy: isBusy.value,
        error: formError.value,
      };
    },
  };
  emit('session-change', session);
}
function retireSession(): void {
  invalidateSession?.();
  emit('session-change', null);
}
onBeforeUnmount(retireSession);
onDeactivated(retireSession);
onActivated(() => {
  if (props.open) publishSession();
});

const initialSnapshot = ref('');
const labelCreateError = ref<string | null>(null);
const formError = ref<string | null>(null);
const nameLimitFeedback = useTransientFeedback();
const summaryLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();
const krEditorOpen = ref(false);
const persistedStatus = computed(() =>
  props.mode === 'edit' ? (props.goal?.status ?? GoalStatus.Planned) : GoalStatus.Planned,
);
function snapshotDraft(): string {
  return JSON.stringify(draft);
}
function mapKeyResult(goalKr: NonNullable<GoalClientDTO['keyResults']>[number]): DraftKeyResult {
  return {
    id: goalKr.id,
    title: goalKr.title,
    description: goalKr.description,
    calculationMethod: goalKr.progress.aggregationMethod,
    initialValue: goalKr.progress.initialValue,
    currentValue: goalKr.progress.currentValue,
    targetValue: goalKr.progress.targetValue,
    target: copyValue(goalKr.target),
    unit: goalKr.progress.unit,
    weight: goalKr.weight,
  };
}
function reset(): void {
  const goal = props.mode === 'edit' ? props.goal : null;
  draft.name = goal?.name ?? '';
  draft.summary = goal?.summary ?? '';
  draft.description = goal?.description ?? '';
  draft.status = goal?.status ?? GoalStatus.Planned;
  draft.start = goal?.start ? { ...goal.start } : null;
  draft.target = goal?.target ? { ...goal.target } : null;
  draft.reminderConfig = goal?.reminderConfig
    ? {
        enabled: goal.reminderConfig.enabled,
        triggers: goal.reminderConfig.triggers.map((trigger) => ({ ...trigger })),
      }
    : null;
  draft.labelIds = goal?.labels.map((label) => label.id) ?? [];
  draft.keyResults = goal?.keyResults?.map(mapKeyResult) ?? [];
  labelCreateError.value = null;
  formError.value = null;
  nameLimitFeedback.hide();
  summaryLimitFeedback.hide();
  descriptionLimitFeedback.hide();
  krEditorOpen.value = false;
  submitCoordinator = null;
  editingBlocked.value = false;
  initialSnapshot.value = snapshotDraft();
  emit('dirty-change', false);
}

watch(
  () => [props.open, props.mode, props.goal?.id] as const,
  ([isOpen]) => {
    retireSession();
    if (isOpen) {
      reset();
      publishSession();
    }
  },
  { immediate: true, deep: false },
);
watch(draft, () => emit('dirty-change', props.open && snapshotDraft() !== initialSnapshot.value), {
  deep: true,
});

function setOpen(value: boolean): void {
  if (!value && isBusy.value) return;
  publishOpen(value);
}

function publishOpen(value: boolean): void {
  if (!value) retireSession();
  emit('update:open', value);
  if (!value) emit('dirty-change', false);
}

async function createAndSelectLabel(name: string): Promise<void> {
  if (isBusy.value) return;
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    if (!isBusy.value && !draft.labelIds.includes(label.id)) draft.labelIds.push(label.id);
  } catch {
    labelCreateError.value = t('common.operationFailed');
  }
}

function validatePlanningWindow(): boolean {
  if (!draft.start || !draft.target) return true;
  if (goalTimeframeStartBoundary(draft.start) <= goalTimeframeEndBoundary(draft.target)) {
    return true;
  }
  formError.value = t('goal.dialog.invalidPlanningWindow');
  return false;
}

function validateReminderConfig(): boolean {
  const config = draft.reminderConfig;
  if (!config?.enabled) return true;
  for (const trigger of config.triggers.filter((item) => item.enabled)) {
    if (trigger.type === ReminderTriggerType.RemainingDays && !draft.target) {
      formError.value = t('goal.dialog.reminderRemainingDaysRequiresTargetDate');
      return false;
    }
    if (
      trigger.type === ReminderTriggerType.TimeProgressPercentage &&
      (!draft.start || !draft.target)
    ) {
      formError.value = t('goal.dialog.reminderTimeProgressRequiresRange');
      return false;
    }
  }
  return true;
}

async function save(): Promise<void> {
  if (submitCoordinator) {
    await submitCoordinator();
    return;
  }
  await saveOwner();
}

async function saveOwner(context?: GoalNativeSubmitContext): Promise<GoalClientDTO | null> {
  if (isBusy.value) return null;
  submitting.value = true;
  try {
    return (await persistDraft(context)) ?? null;
  } finally {
    submitting.value = false;
  }
}

async function persistDraft(context?: GoalNativeSubmitContext): Promise<GoalClientDTO | undefined> {
  formError.value = null;
  if (
    context &&
    (props.mode !== 'create' ||
      JSON.stringify(context.expectedDraft) !== snapshotDraft() ||
      context.keyResultIds.length !== draft.keyResults.length)
  ) {
    formError.value = t('common.operationFailed');
    return;
  }
  if (
    isSaving.value ||
    !draft.name.trim() ||
    krEditorOpen.value ||
    !validatePlanningWindow() ||
    !validateReminderConfig()
  )
    return;
  const requestedStatus = draft.status;
  if (!isGoalStatusTransitionAllowed(persistedStatus.value, requestedStatus)) {
    formError.value = t('goal.dialog.invalidStatusTransition');
    return;
  }
  // Semantic edits share the same owner validation as manual submission, including
  // constraints normally enforced while committing a native KR row.
  if (draft.keyResults.some((item) => !item.title.trim())) {
    formError.value = t('common.operationFailed');
    return;
  }
  if (draft.keyResults.some((item) => item.initialValue === item.targetValue)) {
    formError.value = t('goal.dialog.krInitialTargetConflict');
    return;
  }
  const labelIds = [...draft.labelIds];
  const keyResults = draft.keyResults.map((item) => ({ ...item }));
  const common = {
    name: draft.name.trim(),
    summary: draft.summary.trim() || undefined,
    description: draft.description.trim() || undefined,
    start: draft.start ?? undefined,
    target: draft.target ?? undefined,
    labelIds,
  };

  if (props.mode === 'edit' && props.goal) {
    const req: UpdateGoalReq = {
      expectedVersion: props.goal.version,
      ...common,
      summary: common.summary ?? null,
      description: common.description ?? null,
      start: common.start ?? null,
      target: common.target ?? null,
      reminderConfig: draft.reminderConfig,
      keyResults,
    };
    const parsed = UpdateGoalSchema.safeParse(req);
    if (!parsed.success) {
      formError.value = parsed.error.issues[0]?.message ?? t('common.operationFailed');
      return;
    }
    const saved = await updateGoal(String(props.goal.id), parsed.data);
    if (!saved) return;
    const finalGoal = await transitionGoalStatus(saved, requestedStatus);
    emit('updated', finalGoal ?? saved);
    publishOpen(false);
    return finalGoal ?? saved;
  }

  const req: CreateGoalReq = {
    ...common,
    ...(context ? { id: context.createId } : {}),
    ...(draft.reminderConfig ? { reminderConfig: draft.reminderConfig } : {}),
    initialKeyResults: keyResults.map(({ id: _id, ...item }, index) => ({
      ...item,
      ...(context ? { id: context.keyResultIds[index] } : {}),
    })),
  };
  const parsed = CreateGoalSchema.safeParse(req);
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? t('common.operationFailed');
    return;
  }
  if (context?.pendingLabelNames.length) {
    const resolved = await resolveNames(context.pendingLabelNames);
    parsed.data.labelIds = [...new Set([...labelIds, ...resolved])];
  }
  context?.onCreateAttempt?.();
  const saved = await createGoal(parsed.data);
  if (!saved) return;
  const finalGoal = await transitionGoalStatus(saved, requestedStatus);
  emit('created', finalGoal ?? saved);
  publishOpen(false);
  return finalGoal ?? saved;
}
</script>
