<template>
  <GoalFormFrame
    :open="open"
    :presentation="presentation"
    :close-disabled="interactionBusy"
    @update:open="setOpen"
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
        :disabled="fieldsBusy"
        data-testid="goal-create-with-ai"
        @click="emit('create-with-ai')"
      >
        <Sparkles class="mr-1 h-4 w-4" />
        {{ t('goal.dialog.createWithAI') }}
      </Button>
    </template>

    <form
      id="goal-form"
      data-testid="goal-form"
      class="flex min-h-full flex-col gap-6"
      @submit.prevent="save"
    >
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
            :disabled="fieldsBusy"
            :max-length="80"
            :rows="1"
            data-testid="goal-name-input"
            class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
            :placeholder="t('goal.dialog.goalTitlePlaceholder')"
            :aria-describedby="nameError ? 'goal-name-limit-feedback' : undefined"
            :aria-invalid="Boolean(nameError)"
            focus-ring
            @blur="nameTouched = true"
            @limit-exceeded="nameLimitFeedback.show()"
          />
          <ProductInlineValidation
            id="goal-name-limit-feedback"
            test-id="goal-name-limit-error"
            :visible="Boolean(nameError)"
            :message="nameError"
          />
        </div>

        <div>
          <Label for="goal-summary" class="sr-only">{{ t('goal.dialog.summary') }}</Label>
          <ProductAutoTextarea
            id="goal-summary"
            ref="summaryInput"
            v-model="draft.summary"
            :disabled="fieldsBusy"
            :max-length="255"
            :rows="1"
            data-testid="goal-summary-input"
            class="min-h-8 text-sm leading-5 text-muted-foreground"
            :placeholder="t('goal.dialog.summaryPlaceholder')"
            :aria-describedby="
              summaryLimitFeedback.visible.value ? 'goal-summary-limit-feedback' : undefined
            "
            :aria-invalid="summaryLimitFeedback.visible.value || undefined"
            :focus-ring="true"
            @limit-exceeded="summaryLimitFeedback.show()"
          />
          <ProductInlineValidation
            id="goal-summary-limit-feedback"
            test-id="goal-summary-limit-error"
            :visible="summaryLimitFeedback.visible.value"
            :message="t('goal.dialog.summaryLimitExceeded')"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2" data-testid="goal-property-chips">
          <GoalStatusPicker
            v-model="draft.status"
            :base-status="persistedStatus"
            :disabled="fieldsBusy"
          />
          <GoalTimeframePicker
            v-model="draft.start"
            :disabled="fieldsBusy"
            :label="t('goal.dialog.startDate')"
            test-id="goal-start-chip"
            :aria-label="t('goal.dialog.startDate')"
            :placeholder="t('goal.dialog.startDate')"
            :max-start-boundary="draft.target ? goalTimeframeEndBoundary(draft.target) : undefined"
            :constraint-text="t('goal.dialog.startAfterTarget')"
          />

          <GoalTimeframePicker
            v-model="draft.target"
            :disabled="fieldsBusy"
            test-id="goal-target-chip"
            :aria-label="t('goal.dialog.target')"
            :placeholder="t('goal.dialog.target')"
            :min-end-boundary="draft.start ? goalTimeframeStartBoundary(draft.start) : undefined"
            :constraint-text="t('goal.dialog.targetBeforeStart')"
          />

          <LabelPicker
            v-model="draft.labelIds"
            :options="labelOptions"
            :disabled="labelsLoading || fieldsBusy"
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
            :disabled="fieldsBusy"
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
                :disabled="fieldsBusy"
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
                :disabled="fieldsBusy"
                data-testid="goal-notes-create-with-ai"
                @click="emit('create-with-ai')"
              >
                <Sparkles class="mr-1 h-4 w-4" />
                {{ t('goal.dialog.createWithAI') }}
              </Button>
            </PopoverContent>
          </Popover>
        </div>

        <ProductInlineValidation
          test-id="goal-submit-error"
          :visible="Boolean(formError || labelCreateError)"
          :message="formError || labelCreateError || ''"
        />
      </section>

      <section class="space-y-2" data-testid="goal-description-section">
        <Label for="goal-description" class="sr-only">{{ t('goal.dialog.description') }}</Label>
        <ProductAutoTextarea
          id="goal-description"
          ref="descriptionInput"
          v-model="draft.description"
          :disabled="fieldsBusy"
          :max-length="10000"
          :rows="5"
          data-testid="goal-description-input"
          class="min-h-32 text-sm leading-6 text-foreground/90"
          :placeholder="t('goal.dialog.descriptionLongPlaceholder')"
          :aria-describedby="
            descriptionLimitFeedback.visible.value ? 'goal-description-limit-feedback' : undefined
          "
          :aria-invalid="descriptionLimitFeedback.visible.value || undefined"
          :focus-ring="true"
          @limit-exceeded="descriptionLimitFeedback.show()"
        />
        <ProductInlineValidation
          id="goal-description-limit-feedback"
          test-id="goal-description-limit-error"
          :visible="descriptionLimitFeedback.visible.value"
          :message="t('goal.dialog.descriptionLimitExceeded')"
        />
      </section>

      <div
        v-if="checkpointMessage"
        class="text-xs text-muted-foreground"
        role="status"
        :aria-live="
          ['conflict', 'unavailable', 'pending', 'workflow'].includes(checkpoint.status.value)
            ? 'polite'
            : 'off'
        "
        data-testid="goal-draft-checkpoint-status"
      >
        <p>{{ checkpointMessage }}</p>
        <Button
          v-if="checkpoint.status.value === 'conflict' || checkpoint.status.value === 'unavailable'"
          type="button"
          size="sm"
          variant="ghost"
          @click="reloadCheckpoint"
        >
          {{ t('goal.dialog.checkpointReload') }}
        </Button>
        <Button
          v-if="checkpoint.status.value === 'pending' || checkpoint.status.value === 'workflow'"
          type="button"
          size="sm"
          variant="ghost"
          @click="checkCheckpoint()"
        >
          {{ t('goal.dialog.checkpointCheck') }}
        </Button>
        <Button
          v-if="checkpoint.status.value === 'pending' && !checkpoint.content.value?.workflowRunId"
          type="button"
          size="sm"
          variant="ghost"
          :disabled="submitting || isSaving"
          @click="saveOwner()"
        >
          {{ t('goal.dialog.checkpointRetrySave') }}
        </Button>
      </div>
      <GoalKeyResultDraftEditor
        :key="mode"
        v-model="draft.keyResults"
        class="mt-auto"
        :disabled="fieldsBusy"
        :goal-start="draft.start"
        :goal-target="draft.target"
        @editing-change="krEditorOpen = $event"
      />
    </form>

    <template #footer>
      <Button variant="ghost" :disabled="interactionBusy" @click="setOpen(false)">
        {{ t('common.cancel') }}
      </Button>
      <Button
        type="submit"
        form="goal-form"
        data-testid="save-goal-button"
        :disabled="
          !draft.name.trim() ||
          interactionBusy ||
          checkpoint.blocked.value ||
          checkpoint.status.value === 'unavailable' ||
          krEditorOpen
        "
      >
        {{ mode === 'edit' ? t('goal.dialog.saveChanges') : t('goal.dialog.createGoal') }}
      </Button>
    </template>
  </GoalFormFrame>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
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
} from '@memoflow/goal-contracts';
import { Button, Label, Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import {
  LabelPicker,
  ProductAutoTextarea,
  ProductPropertyChip,
} from '../../../../shared/components';
import ProductInlineValidation from '../../../../shared/components/ProductInlineValidation.vue';
import { validateGoalNativePatch } from '../../composables/validateGoalNativePatch';
import GoalFormFrame from './GoalFormFrame.vue';
import GoalReminderChip from '../GoalReminderChip.vue';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';
import GoalStatusPicker from '../GoalStatusPicker.vue';
import GoalKeyResultDraftEditor from '../GoalKeyResultDraftEditor.vue';
import { useLabelCatalog } from '../../../../shared/composables/useLabelCatalog';
import { isGoalStatusTransitionAllowed } from '../../composables/goalStatusTransitions';
import { useGoal } from '../../composables/useGoal';
import { useTransientFeedback } from '../../../../shared/composables/useTransientFeedback';
import { useDialogCloseGuard } from '../../../../shared/composables/useDialogCloseGuard';
import {
  GOAL_DRAFT_CHECKPOINT_KEY,
  GOAL_SERVICE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
} from '../../../../di/keys';
import { useGoalDraftCheckpoint } from '../../composables/useGoalDraftCheckpoint';
import { subscribeWorkspaceEvents } from '../../../../shared/services/workspace-event-subscription';

import type {
  GoalDraftKeyResult as DraftKeyResult,
  GoalNativeDraft,
  GoalNativeSubmitContext,
  GoalNativeEditSession,
} from '../../composables/goalNativeEditSession';

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode?: 'create' | 'edit';
    goal?: GoalClientDTO | null;
    presentation?: 'dialog' | 'panel';
  }>(),
  { mode: 'create', goal: null, presentation: 'dialog' },
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
const { createGoal, updateGoal, transitionGoalStatus, isSaving, lastCreateRejected } = useGoal();
const checkpointStore = inject(GOAL_DRAFT_CHECKPOINT_KEY, undefined);
const checkpoint = useGoalDraftCheckpoint(checkpointStore);
const ownerService = inject(GOAL_SERVICE_KEY, undefined);
const workflowRuntime = inject(AI_WORKFLOW_RUNTIME_KEY, undefined);
const checkpointLoading = ref(false);
const checkpointMessage = computed(() => {
  const status = checkpoint.status.value;
  if (status === 'idle') return '';
  if (krEditorOpen.value && (status === 'saved' || status === 'saving'))
    return t('goal.dialog.checkpointKeyResultEditing');
  return t(`goal.dialog.checkpoint${status[0]!.toUpperCase()}${status.slice(1)}`);
});
const restoredWorkflowRunId = ref<string | null>(null);
const controlOwnerId = ref<string | null>(null);
let checkpointEpoch = 0;
const submitting = ref(false);
const editingBlocked = ref(false);
// Session-local capability: the scoped AI handle can mutate while user commands cannot.
// Reload invalidates the handle; the durable workflow restores only through a fresh safety check.
const control = ref<symbol | null>(null);
// Once the AI has projected a draft and coordinated submit/cancel, the owner must be
// able to confirm or dismiss it even though the AI capability still holds `control`.
// `isBusy` keeps inputs locked during AI patching; `interactionBusy` gates only the
// Save/Cancel affordances and the close guard so the owner can always settle a review.
const coordinated = ref(false);
const isBusy = computed(
  () =>
    checkpointLoading.value ||
    submitting.value ||
    isSaving.value ||
    editingBlocked.value ||
    control.value !== null,
);
const fieldsBusy = computed(() => isBusy.value || checkpoint.blocked.value);
const interactionBusy = computed(
  () =>
    submitting.value ||
    isSaving.value ||
    editingBlocked.value ||
    (control.value !== null && !coordinated.value),
);
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
let cancelCoordinator: (() => Promise<void>) | null = null;
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
  function makeSession(capability?: symbol): GoalNativeEditSession {
    function assertActive(): void {
      if (!active || !props.open || (capability && control.value !== capability))
        throw new Error('Goal edit session is closed');
    }
    function assertAuthority(): void {
      assertActive();
      if (control.value !== null && control.value !== capability)
        throw new Error('Goal edit session is controlled by AI');
    }
    function assertEditable(): void {
      assertAuthority();
      if (checkpointLoading.value || submitting.value || isSaving.value || editingBlocked.value)
        throw new Error('Goal edit session is busy');
    }
    const session: GoalNativeEditSession = {
      claimControl(ownerId) {
        assertEditable();
        if (checkpoint.blocked.value) {
          if (restoredWorkflowRunId.value === ownerId && checkpoint.adoptWorkflow(ownerId))
            restoredWorkflowRunId.value = null;
          else throw new Error('Goal draft requires checkpoint reconciliation');
        }
        if (!ownerId.trim() || control.value !== null || krEditorOpen.value)
          throw new Error('Goal edit session cannot be claimed');
        const token = Symbol(ownerId);
        control.value = token;
        controlOwnerId.value = ownerId;
        return makeSession(token);
      },
      releaseControl() {
        assertAuthority();
        if (!capability) return;
        if (submitting.value || isSaving.value) throw new Error('Goal edit session is busy');
        control.value = null;
        editingBlocked.value = false;
      },
      detachWorkflow() {
        assertAuthority();
        if (submitting.value || isSaving.value) throw new Error('Goal edit session is busy');
        // Unlike review handoff, a terminated run must never coordinate a later Save/Cancel.
        submitCoordinator = null;
        cancelCoordinator = null;
        coordinated.value = false;
        editingBlocked.value = false;
        control.value = null;
        controlOwnerId.value = null;
      },
      setEditingBlocked(blocked) {
        assertAuthority();
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
        if (capability) validateGoalNativePatch(draft, detached, persistedStatus.value);
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
        if (capability)
          validateGoalNativePatch(
            draft,
            { keyResults: [...draft.keyResults, child] },
            persistedStatus.value,
          );
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
        if (capability)
          validateGoalNativePatch(
            draft,
            { keyResults: draft.keyResults.filter((_item, position) => position !== index) },
            persistedStatus.value,
          );
        draft.keyResults.splice(index, 1);
      },
      async focus(field) {
        assertActive();
        await nextTick();
        assertActive();
        const inputs = { name: nameInput, summary: summaryInput, description: descriptionInput };
        inputs[field].value?.$el.focus();
      },
      coordinateSubmit(submit, cancel) {
        assertEditable();
        if (props.mode !== 'create')
          throw new Error('Submission coordination requires create mode');
        submitCoordinator = submit;
        cancelCoordinator = cancel;
        coordinated.value = true;
      },
      async requestSubmit(context) {
        assertEditable();
        if (submitCoordinator && !context)
          throw new Error('Coordinated Goal submit requires owner context');
        return saveOwner(context, capability);
      },
      requestCancel() {
        assertEditable();
        // Programmatic owner/workflow cancellation is not a user dismissal.
        // Bypass the dirty-close prompt so automation cannot deadlock on UI confirmation.
        publishOpen(false);
      },
      readDraftState() {
        assertActive();
        return {
          revision: draftRevision.value,
          mode: props.mode,
          goalId: props.mode === 'edit' && props.goal ? String(props.goal.id) : null,
          draft: copyValue(draft),
          dirty: snapshotDraft() !== initialSnapshot.value,
          busy: isBusy.value,
          ...(restoredWorkflowRunId.value
            ? { restoredWorkflowRunId: restoredWorkflowRunId.value }
            : {}),
          error: formError.value,
        };
      },
    };
    return session;
  }
  emit('session-change', makeSession());
}
function retireSession(): void {
  control.value = null;
  editingBlocked.value = false;
  coordinated.value = false;
  invalidateSession?.();
  emit('session-change', null);
}
onBeforeUnmount(retireSession);
onDeactivated(retireSession);
onActivated(() => {
  if (props.open) publishSession();
});

const initialSnapshot = ref('');
const draftRevision = ref(0);
const isDirty = computed(() => props.open && snapshotDraft() !== initialSnapshot.value);
const labelCreateError = ref<string | null>(null);
const formError = ref<string | null>(null);
const nameLimitFeedback = useTransientFeedback();
const nameTouched = ref(false);
const nameError = computed(() =>
  nameTouched.value && !draft.name.trim()
    ? t('goal.dialog.titleRequired')
    : nameLimitFeedback.visible.value
      ? t('goal.dialog.nameLimitExceeded')
      : '',
);
const summaryLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();
watch(
  () => draft.name,
  (value) => {
    if (value.length < 80) nameLimitFeedback.hide();
  },
);
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
  nameTouched.value = false;
  nameLimitFeedback.hide();
  summaryLimitFeedback.hide();
  descriptionLimitFeedback.hide();
  krEditorOpen.value = false;
  submitCoordinator = null;
  cancelCoordinator = null;
  editingBlocked.value = false;
  coordinated.value = false;
  initialSnapshot.value = snapshotDraft();
  emit('dirty-change', false);
}

watch(
  () => [props.open, props.mode, props.goal?.id, props.presentation] as const,
  async ([isOpen]) => {
    const epoch = ++checkpointEpoch;
    checkpoint.stop();
    restoredWorkflowRunId.value = null;
    checkpointLoading.value = false;
    controlOwnerId.value = null;
    retireSession();
    if (isOpen) {
      reset();
      if (props.mode === 'create' && checkpointStore?.scope()) {
        checkpointLoading.value = true;
        const saved = await checkpoint.begin();
        if (epoch !== checkpointEpoch || !props.open) return;
        if (saved) {
          Object.assign(draft, copyValue(saved.draft));
          restoredWorkflowRunId.value = saved.workflowRunId;
          emit('dirty-change', isDirty.value);
        }
        checkpointLoading.value = false;
      }
      publishSession();
      if (checkpoint.content.value && checkpoint.blocked.value) void checkCheckpoint();
    }
  },
  { immediate: true, deep: false },
);
watch(
  draft,
  () => {
    draftRevision.value++;
    emit('dirty-change', isDirty.value);
    if (props.open && props.mode === 'create' && !checkpointLoading.value)
      checkpoint.capture(copyValue(draft), controlOwnerId.value);
  },
  { deep: true, flush: 'sync' },
);
watch(
  controlOwnerId,
  (owner) => {
    if (props.open && props.mode === 'create' && !checkpointLoading.value)
      checkpoint.capture(copyValue(draft), owner);
  },
  { flush: 'sync' },
);
watch(
  () => checkpointStore?.scope(),
  (scope, old) => {
    if (old && scope !== old) {
      checkpointEpoch++;
      checkpoint.stop();
      retireSession();
      reset();
      publishOpen(false);
    }
  },
);
watch(
  () => checkpoint.content.value?.workflowRunId,
  (runId, _old, onCleanup) => {
    if (!runId || !workflowRuntime?.streamWorkspaceEvents || !props.open) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void subscribeWorkspaceEvents(workflowRuntime, {
      signal: controller.signal,
      onEvent: async (event) => {
        if (checkpoint.status.value !== 'workflow' && checkpoint.status.value !== 'pending') return;
        if (event.type === 'stream.ready' || event.type === 'stream.reset_required') {
          await checkCheckpoint(undefined, true);
        } else if (
          event.type === 'workflow.updated' &&
          event.data.kind === 'goal.create' &&
          event.data.runId === runId
        )
          await checkCheckpoint(event.data, true);
      },
    }).catch(() => {
      /* Explicit checking remains available; loss is not a failed Goal. */
    });
  },
);

async function reloadCheckpoint(): Promise<void> {
  const epoch = ++checkpointEpoch;
  checkpointLoading.value = true;
  const saved = await checkpoint.begin();
  if (epoch !== checkpointEpoch || !props.open) return;
  if (saved) Object.assign(draft, copyValue(saved.draft));
  restoredWorkflowRunId.value = saved?.workflowRunId ?? null;
  checkpointLoading.value = false;
  if (saved && checkpoint.blocked.value) await checkCheckpoint();
  else if (!saved) checkpoint.capture(copyValue(draft), controlOwnerId.value);
}

let checkpointCheck: Promise<void> | null = null;
async function checkCheckpoint(
  run?: import('@memoflow/contracts/ai').AIWorkflowRunView,
  required = false,
): Promise<void> {
  const epoch = checkpointEpoch;
  // A pre-watermark read cannot settle a newer event or reconnect boundary.
  // Serialize calibrations, then read again (or apply the terminal payload).
  while (checkpointCheck) {
    try {
      await checkpointCheck;
    } catch {
      /* The next calibration can recover. */
    }
    if (epoch !== checkpointEpoch) return;
  }
  const record = checkpoint.content.value;
  const operation = (async () => {
    if (!record || !props.open || props.mode !== 'create') return;
    const active = () =>
      epoch === checkpointEpoch &&
      props.open &&
      checkpointStore?.scope() === checkpoint.scope.value;
    const settleReceipt = async (id: string, goal: GoalClientDTO) => {
      if (String(goal.id) !== id || !active()) return;
      await checkpoint.complete();
      if (!active()) return;
      emit('created', goal);
      publishOpen(false);
    };
    let receiptMissing = false;
    if (record.phase === 'submit_pending') {
      if (!ownerService) return;
      const result = await ownerService.getGoal(record.createId);
      if (!active()) return;
      if (result.ok) {
        await settleReceipt(record.createId, result.data.toDTO());
        return;
      }
      if (result.error.code !== 'NOT_FOUND') {
        if (required) throw new Error('Goal receipt unavailable');
        return;
      }
      receiptMissing = true;
      // A missing manual receipt permits replay of this exact ID and payload,
      // never a new create intention or an automatic replacement of the draft.
      if (!record.workflowRunId) return;
    }
    if (
      record.workflowRunId?.startsWith('local-agent:') &&
      restoredWorkflowRunId.value === record.workflowRunId &&
      controlOwnerId.value === null
    ) {
      // Local Agent ownership is renderer-local, not a resumable Mastra run.
      // Any submit_pending receipt has already been checked above. A missing
      // receipt stays pending with its original ID/payload for explicit retry.
      if (await checkpoint.detachTransientWorkflow(record.workflowRunId)) {
        if (active()) restoredWorkflowRunId.value = null;
      }
      return;
    }
    if (!record.workflowRunId || !workflowRuntime) return;
    const snapshot = run ?? (await workflowRuntime.get({ runId: record.workflowRunId }));
    if (!active()) return;
    if (!snapshot) {
      if (!receiptMissing) {
        if (!ownerService) return;
        const receipt = await ownerService.getGoal(record.createId);
        if (!active()) return;
        if (receipt.ok) {
          await settleReceipt(record.createId, receipt.data.toDTO());
          return;
        }
        if (receipt.error.code !== 'NOT_FOUND') {
          if (required) throw new Error('Goal receipt unavailable');
          return;
        }
      }
      if (await checkpoint.allowEditing()) {
        controlOwnerId.value = null;
        restoredWorkflowRunId.value = null;
      }
      return;
    }
    if (snapshot.kind !== 'goal.create' || snapshot.runId !== record.workflowRunId) return;
    if (snapshot.result?.referenceMap.goal) {
      if (!ownerService) return;
      const id = snapshot.result.referenceMap.goal;
      const receipt = await ownerService.getGoal(id);
      if (receipt.ok) await settleReceipt(id, receipt.data.toDTO());
      else if (required) throw new Error('Goal receipt unavailable');
      return;
    }
    if (snapshot.status === 'failed' || snapshot.status === 'cancelled') {
      if (await checkpoint.allowEditing()) {
        controlOwnerId.value = null;
        restoredWorkflowRunId.value = null;
      }
    } else if (snapshot.status === 'running' || snapshot.status === 'suspended') {
      restoredWorkflowRunId.value = record.workflowRunId;
    }
  })();
  checkpointCheck = operation;
  try {
    await operation;
  } catch (error) {
    // Unknown authority keeps the draft frozen; stream calibration must also
    // reject so the transport cannot ACK a snapshot it failed to establish.
    if (required) throw error;
  } finally {
    if (checkpointCheck === operation) checkpointCheck = null;
  }
}

const { requestClose } = useDialogCloseGuard({
  dirty: isDirty,
  busy: interactionBusy,
  onClose: async () => {
    if (cancelCoordinator) {
      await cancelCoordinator();
      return;
    }
    await checkpoint.discard();
    publishOpen(false);
  },
});

function setOpen(value: boolean): void {
  if (value) {
    publishOpen(true);
    return;
  }
  void requestClose();
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
  nameTouched.value = true;
  if (submitting.value || isSaving.value || editingBlocked.value) return;
  if (submitCoordinator) {
    await submitCoordinator();
    return;
  }
  if (control.value !== null) return;
  try {
    await saveOwner();
  } catch {
    // The owner reports the failure inline; native callers still receive the rejection.
  }
}

async function saveOwner(
  context?: GoalNativeSubmitContext,
  capability?: symbol,
): Promise<GoalClientDTO | null> {
  if (
    submitting.value ||
    isSaving.value ||
    editingBlocked.value ||
    (control.value !== null && control.value !== capability)
  )
    return null;
  submitting.value = true;
  try {
    return (await persistDraft(context)) ?? null;
  } catch (error) {
    formError.value = t('common.operationFailed');
    throw error;
  } finally {
    submitting.value = false;
  }
}

async function persistDraft(context?: GoalNativeSubmitContext): Promise<GoalClientDTO | undefined> {
  formError.value = null;
  const identityScope = checkpointStore?.scope();
  const sameIdentity = () => checkpointStore?.scope() === identityScope;
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
    const req = {
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
    if (!saved) {
      formError.value = t('common.operationFailed');
      return;
    }
    if (!sameIdentity()) return;
    const finalGoal = await transitionGoalStatus(saved, requestedStatus);
    if (!sameIdentity()) return;
    emit('updated', finalGoal ?? saved);
    publishOpen(false);
    return finalGoal ?? saved;
  }

  const req = {
    ...common,
    ...(context
      ? { id: context.createId, nativeAiLease: context.nativeAiLease }
      : checkpoint.content.value
        ? { id: checkpoint.content.value.createId }
        : {}),
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
  if (!(await checkpoint.prepare(copyValue(draft), context?.createId, controlOwnerId.value)))
    return;
  // First save can precede autosave completion; the checkpoint allocates the stable ID.
  if (!context && checkpoint.content.value) parsed.data.id = checkpoint.content.value.createId;
  context?.onCreateAttempt?.();
  const saved = await createGoal(parsed.data);
  if (!saved) {
    formError.value = t('common.operationFailed');
    if (!context && lastCreateRejected?.value) await checkpoint.allowEditing();
    else if (!context) void checkCheckpoint();
    return;
  }
  if (!sameIdentity()) return;
  const finalGoal = await transitionGoalStatus(saved, requestedStatus);
  await checkpoint.complete();
  if (!sameIdentity()) return;
  emit('created', finalGoal ?? saved);
  publishOpen(false);
  return finalGoal ?? saved;
}
</script>
