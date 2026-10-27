<template>
  <ProductEditorFrame
    :open="open"
    :presentation="presentation"
    :close-disabled="saving"
    test-id="routine-editor-dialog"
    title-id="routine-editor-panel-title"
    recipe="workspace"
    initial-focus-selector="[data-testid='routine-name-input']"
    return-focus-selector="[data-testid='routine-create-button']"
    @update:open="handleOpenChange"
  >
    <template #title>{{ routine ? t('routine.edit') : t('routine.create') }}</template>

    <form
      id="routine-editor-form"
      class="flex min-h-full flex-col gap-6"
      @submit.prevent="submit"
      @focusout="timingTouched = true"
    >
      <section
        class="space-y-4 border-b border-[hsl(var(--border-subtle))] pb-5"
        data-testid="routine-identity-section"
      >
        <div>
          <ProductAutoTextarea
            v-model="name"
            :max-length="100"
            :rows="1"
            data-testid="routine-name-input"
            class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
            :placeholder="t('routine.form.namePlaceholder')"
            :aria-label="t('routine.form.name')"
            :aria-describedby="nameError ? 'routine-name-limit-feedback' : undefined"
            focus-ring
            :aria-invalid="Boolean(nameError)"
            :disabled="saving"
            @blur="nameTouched = true"
            @limit-exceeded="nameLimitFeedback.show()"
          />
          <ProductInlineValidation
            id="routine-name-limit-feedback"
            test-id="routine-name-limit-error"
            :visible="Boolean(nameError)"
            :message="nameError"
          />
        </div>

        <div>
          <ProductAutoTextarea
            v-model="description"
            :max-length="2000"
            :rows="2"
            data-testid="routine-description-input"
            class="min-h-8 text-sm leading-5 text-muted-foreground"
            :placeholder="t('routine.form.descriptionPlaceholder')"
            :aria-label="t('routine.form.description')"
            :aria-describedby="
              descriptionLimitFeedback.visible.value
                ? 'routine-description-limit-feedback'
                : undefined
            "
            :aria-invalid="descriptionLimitFeedback.visible.value"
            :focus-ring="true"
            :disabled="saving"
            @limit-exceeded="descriptionLimitFeedback.show()"
          />
          <ProductInlineValidation
            id="routine-description-limit-feedback"
            test-id="routine-description-limit-error"
            :visible="descriptionLimitFeedback.visible.value"
            :message="t('routine.form.descriptionLimitExceeded')"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2" data-testid="routine-property-chips">
          <DropdownMenu :modal="false">
            <DropdownMenuTrigger as-child>
              <ProductPropertyChip
                :disabled="saving"
                :aria-label="t('routine.form.triggerType')"
                data-testid="routine-trigger-type"
                :data-trigger-type="triggerType"
              >
                <template #icon>
                  <component :is="currentTriggerOption.icon" class="h-3.5 w-3.5" />
                </template>
                {{ triggerChipLabel }}
              </ProductPropertyChip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-52">
              <DropdownMenuRadioGroup
                :model-value="triggerType"
                @update:model-value="updateTriggerType"
              >
                <DropdownMenuRadioItem
                  v-for="option in triggerOptions"
                  :key="option.value"
                  :value="option.value"
                  :data-testid="`routine-trigger-option-${option.value}`"
                  class="gap-2"
                >
                  <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{{ option.label }}</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <ElapsedTriggerEditor
            v-if="triggerType === 'Elapsed'"
            v-model:duration-minutes="durationMinutes"
            v-model:anchor="elapsedAnchor"
            :disabled="saving"
          />

          <ActiveUsageTriggerEditor
            v-if="triggerType === 'ActiveUsage'"
            v-model:active-minutes="activeMinutes"
            v-model:natural-break-minutes="naturalBreakMinutes"
            v-model:anchor="activeAnchor"
            :disabled="saving"
          />

          <ProfileScopeControl
            v-model:selected-profile-ids="selectedProfileIds"
            :profiles="profiles"
            :disabled="saving"
          />
        </div>

        <p
          v-if="requiresDesktopRuntime"
          class="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="routine-desktop-runtime-hint"
        >
          <Monitor class="h-3.5 w-3.5 shrink-0" />
          {{ t('routine.form.desktopRuntimeRequired') }}
        </p>
      </section>

      <WallClockTriggerEditor
        v-if="triggerType === 'WallClock'"
        v-model:local-time="localTime"
        v-model:start-date="startDate"
        v-model:frequency="frequency"
        v-model:recurrence-interval="recurrenceInterval"
        v-model:selected-weekdays="selectedWeekdays"
        v-model:time-zone="timeZone"
        :disabled="saving"
      />
      <ProductInlineValidation
        id="routine-submit-feedback"
        test-id="routine-submit-error"
        :visible="Boolean(submitError || timingError)"
        :message="submitError || timingError"
      />
    </form>

    <template #footer>
      <Button
        type="button"
        variant="ghost"
        data-testid="routine-editor-cancel"
        :disabled="saving"
        @click="requestClose()"
      >
        {{ t('routine.form.cancel') }}
      </Button>
      <Button
        type="submit"
        form="routine-editor-form"
        :disabled="!canSubmit || saving"
        :loading="saving"
        data-testid="routine-editor-save"
      >
        {{ routine ? t('routine.form.save') : t('routine.form.create') }}
      </Button>
    </template>
  </ProductEditorFrame>
</template>

<script setup lang="ts">
import { routineUiHost } from '../routine-ui-host';
const { getProductTime, getProductTodayYmd, useDialogCloseGuard, useTransientFeedback } =
  routineUiHost;
const { ProductAutoTextarea, ProductEditorFrame, ProductInlineValidation, ProductPropertyChip } =
  routineUiHost.components;

import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Activity, CircleOff, Clock3, Monitor, Repeat2 } from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import type {
  RoutineDefinitionDto,
  RoutineProfileDto,
  RoutineTriggerDto,
} from '@memoflow/routine-contracts';
import {
  parseTimeZoneId,
  parseYmd,
  requireTimeZoneId,
  requireYmd,
} from '@memoflow/shared-primitives';

import ActiveUsageTriggerEditor from './ActiveUsageTriggerEditor.vue';
import ElapsedTriggerEditor from './ElapsedTriggerEditor.vue';
import ProfileScopeControl from './ProfileScopeControl.vue';
import WallClockTriggerEditor from './WallClockTriggerEditor.vue';
import type {
  RoutineActiveAnchor,
  RoutineEditorTriggerType,
  RoutineElapsedAnchor,
  RoutineFrequency,
} from './routine-editor.types';

export interface RoutineEditorPreset {
  readonly name: string;
  readonly description: string;
  readonly trigger: RoutineTriggerDto | null;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    presentation?: 'dialog' | 'panel';
    saving?: boolean;
    submitError?: string | null;
    routine?: RoutineDefinitionDto | null;
    profiles: readonly RoutineProfileDto[];
    membershipProfileIds?: readonly string[];
    preset?: RoutineEditorPreset | null;
    localRuntimeAvailable?: boolean;
  }>(),
  {
    presentation: 'dialog',
    saving: false,
    submitError: null,
    routine: null,
    membershipProfileIds: () => [],
    preset: null,
    localRuntimeAvailable: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  'dirty-change': [dirty: boolean];
  save: [
    value: {
      name: string;
      description: string | null;
      trigger: RoutineTriggerDto | null;
      profileIds: string[];
    },
  ];
}>();

const { t } = useI18n();

const name = ref('');
const nameTouched = ref(false);
const timingTouched = ref(false);
const description = ref('');
const triggerType = ref<RoutineEditorTriggerType>('None');
const localTime = ref('09:00');
const timeZone = ref('UTC');
const startDate = ref(String(getProductTodayYmd()));
const frequency = ref<RoutineFrequency>('daily');
const recurrenceInterval = ref(1);
const selectedWeekdays = ref<number[]>([]);
const durationMinutes = ref(50);
const elapsedAnchor = ref<RoutineElapsedAnchor>('last-satisfied');
const activeMinutes = ref(50);
const naturalBreakMinutes = ref(5);
const activeAnchor = ref<RoutineActiveAnchor>('last-satisfied');
const selectedProfileIds = ref<string[]>([]);
const formBaseline = ref('');
const nameLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();
watch(
  () => name.value,
  (value) => {
    if (value.length < 100) nameLimitFeedback.hide();
  },
);
const nameError = computed(() =>
  nameTouched.value && !name.value.trim()
    ? t('routine.form.nameRequired')
    : nameLimitFeedback.visible.value
      ? t('routine.form.nameLimitExceeded')
      : '',
);

const triggerOptions = computed(() => [
  { value: 'None' as const, label: t('routine.form.noTiming'), icon: CircleOff },
  { value: 'WallClock' as const, label: t('routine.form.wallClock'), icon: Clock3 },
  { value: 'Elapsed' as const, label: t('routine.form.elapsed'), icon: Repeat2 },
  { value: 'ActiveUsage' as const, label: t('routine.form.activeUsage'), icon: Activity },
]);

const currentTriggerOption = computed(
  () =>
    triggerOptions.value.find((option) => option.value === triggerType.value) ??
    triggerOptions.value[0]!,
);

const triggerChipLabel = computed(() =>
  triggerType.value === 'None' ? t('routine.form.timing') : currentTriggerOption.value.label,
);

const requiresDesktopRuntime = computed(
  () =>
    !props.localRuntimeAvailable &&
    (triggerType.value === 'ActiveUsage' ||
      (triggerType.value === 'Elapsed' && elapsedAnchor.value === 'profile-activation')),
);

function snapshotForm(): string {
  return JSON.stringify({
    name: name.value,
    description: description.value,
    triggerType: triggerType.value,
    localTime: localTime.value,
    timeZone: timeZone.value,
    startDate: startDate.value,
    frequency: frequency.value,
    recurrenceInterval: recurrenceInterval.value,
    selectedWeekdays: [...selectedWeekdays.value],
    durationMinutes: durationMinutes.value,
    elapsedAnchor: elapsedAnchor.value,
    activeMinutes: activeMinutes.value,
    naturalBreakMinutes: naturalBreakMinutes.value,
    activeAnchor: activeAnchor.value,
    selectedProfileIds: [...selectedProfileIds.value],
  });
}

const isDirty = computed(() => props.open && snapshotForm() !== formBaseline.value);
watch(isDirty, (dirty) => emit('dirty-change', dirty), { immediate: true });

function localYmd(): string {
  return String(getProductTodayYmd());
}

function productTimeZone(): string {
  return String(getProductTime().context.timeZone);
}

function resetForm(): void {
  nameTouched.value = false;
  timingTouched.value = false;
  const source = props.routine;
  const preset = props.preset;
  name.value = source?.name ?? preset?.name ?? '';
  description.value = source?.description ?? preset?.description ?? '';
  selectedProfileIds.value = [...props.membershipProfileIds];
  nameLimitFeedback.hide();
  descriptionLimitFeedback.hide();

  const trigger = source?.trigger ?? preset?.trigger ?? null;
  triggerType.value = trigger?.type ?? 'None';
  localTime.value = trigger?.type === 'WallClock' ? trigger.localTime : '09:00';
  timeZone.value = trigger?.type === 'WallClock' ? trigger.timeZone : productTimeZone();
  startDate.value = trigger?.type === 'WallClock' ? trigger.recurrence.startDate : localYmd();
  frequency.value = trigger?.type === 'WallClock' ? trigger.recurrence.frequency : 'daily';
  recurrenceInterval.value = trigger?.type === 'WallClock' ? trigger.recurrence.interval : 1;
  selectedWeekdays.value = trigger?.type === 'WallClock' ? [...trigger.recurrence.byWeekday] : [];
  durationMinutes.value =
    trigger?.type === 'Elapsed' ? Math.max(1, Math.round(trigger.durationMs / 60_000)) : 50;
  elapsedAnchor.value = trigger?.type === 'Elapsed' ? trigger.anchor : 'last-satisfied';
  activeMinutes.value =
    trigger?.type === 'ActiveUsage'
      ? Math.max(1, Math.round(trigger.requiredActiveMs / 60_000))
      : 50;
  naturalBreakMinutes.value =
    trigger?.type === 'ActiveUsage'
      ? trigger.naturalBreakCredit
        ? Math.max(1, Math.round(trigger.naturalBreakCredit.idleDurationMs / 60_000))
        : 0
      : 5;
  activeAnchor.value = trigger?.type === 'ActiveUsage' ? trigger.anchor : 'last-satisfied';
  formBaseline.value = snapshotForm();
}

watch(
  () => [
    props.open,
    props.routine?.id,
    props.routine?.version,
    props.preset?.name,
    props.membershipProfileIds.join('|'),
  ],
  () => {
    if (props.open) resetForm();
  },
  { immediate: true },
);

const canSubmit = computed(() => {
  if (!name.value.trim()) return false;
  if (triggerType.value === 'WallClock') {
    return Boolean(
      getProductTime().codec.parseHm(localTime.value) &&
      parseTimeZoneId(timeZone.value) &&
      parseYmd(startDate.value) &&
      recurrenceInterval.value > 0 &&
      (frequency.value !== 'weekly' || selectedWeekdays.value.length > 0),
    );
  }
  if (triggerType.value === 'Elapsed') return durationMinutes.value > 0;
  if (triggerType.value === 'ActiveUsage') return activeMinutes.value > 0;
  return true;
});

const timingError = computed(() =>
  timingTouched.value && name.value.trim() && !canSubmit.value
    ? t('routine.form.invalidTiming')
    : '',
);

function updateTriggerType(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = triggerOptions.value.find((candidate) => candidate.value === value);
  if (option) triggerType.value = option.value;
}

function buildTrigger(): RoutineTriggerDto | null {
  if (triggerType.value === 'None') return null;

  if (triggerType.value === 'WallClock') {
    return {
      type: 'WallClock',
      timingOwner: 'scheduler',
      localTime: localTime.value,
      timeZone: requireTimeZoneId(timeZone.value),
      recurrence: {
        startDate: requireYmd(startDate.value),
        frequency: frequency.value,
        interval: Math.max(1, Math.trunc(recurrenceInterval.value)),
        byWeekday:
          frequency.value === 'weekly' ? [...selectedWeekdays.value].sort((a, b) => a - b) : [],
        count: null,
        until: null,
      },
    };
  }

  if (triggerType.value === 'Elapsed') {
    const anchor = elapsedAnchor.value;
    return anchor === 'profile-activation'
      ? {
          type: 'Elapsed',
          timingOwner: 'local-runtime',
          durationMs: Math.max(1, durationMinutes.value) * 60_000,
          anchor,
        }
      : {
          type: 'Elapsed',
          timingOwner: 'scheduler',
          durationMs: Math.max(1, durationMinutes.value) * 60_000,
          anchor,
        };
  }

  return {
    type: 'ActiveUsage',
    timingOwner: 'local-runtime',
    requiredActiveMs: Math.max(1, activeMinutes.value) * 60_000,
    anchor: activeAnchor.value,
    naturalBreakCredit:
      naturalBreakMinutes.value > 0
        ? {
            idleDurationMs: naturalBreakMinutes.value * 60_000,
            effect: 'satisfy-and-reset',
          }
        : null,
    protocolBreakCredit: null,
  };
}

function submit(): void {
  nameTouched.value = true;
  if (!canSubmit.value || props.saving) return;
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim() || null,
    trigger: buildTrigger(),
    profileIds: [...selectedProfileIds.value],
  });
}

const { requestClose } = useDialogCloseGuard({
  dirty: isDirty,
  busy: () => props.saving,
  onClose: () => emit('update:open', false),
});

function handleOpenChange(value: boolean): void {
  if (value) {
    emit('update:open', true);
    return;
  }
  void requestClose();
}
</script>
