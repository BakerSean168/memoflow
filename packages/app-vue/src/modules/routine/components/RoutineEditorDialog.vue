<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <ProductDialogShell
      :open="open"
      test-id="routine-editor-dialog"
      size="lg"
      height-mode="workspace"
      initial-focus-selector="[data-testid='routine-name-input']"
    >
      <template #title>{{ routine ? t('routine.edit') : t('routine.create') }}</template>

      <form
        id="routine-editor-form"
        class="flex min-h-full flex-col gap-6"
        @submit.prevent="submit"
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
              :disabled="saving"
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
              >
                {{ t('routine.form.nameLimitExceeded') }}
              </p>
            </Transition>
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
              :disabled="saving"
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
                class="mt-1 text-xs text-destructive"
                role="alert"
              >
                {{ t('routine.form.descriptionLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div class="flex flex-wrap items-center gap-2" data-testid="routine-property-chips">
            <DropdownMenu>
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
      </form>

      <template #footer>
        <Button
          type="button"
          variant="ghost"
          data-testid="routine-editor-cancel"
          :disabled="saving"
          @click="emit('update:open', false)"
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
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Activity, CircleOff, Clock3, Monitor, Repeat2 } from '@lucide/vue';
import {
  Button,
  Dialog,
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
} from '@memoflow/contracts/routine';
import {
  parseTimeZoneId,
  parseYmd,
  requireTimeZoneId,
  requireYmd,
} from '@memoflow/contracts/primitives';
import {
  ProductAutoTextarea,
  ProductDialogShell,
  ProductPropertyChip,
} from '../../../shared/components';
import { useTransientFeedback } from '../../../shared/composables/useTransientFeedback';
import { getProductTime, getProductTodayYmd } from '../../../shared/utils/product-time';
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
    saving?: boolean;
    routine?: RoutineDefinitionDto | null;
    profiles: readonly RoutineProfileDto[];
    membershipProfileIds?: readonly string[];
    preset?: RoutineEditorPreset | null;
    localRuntimeAvailable?: boolean;
  }>(),
  {
    saving: false,
    routine: null,
    membershipProfileIds: () => [],
    preset: null,
    localRuntimeAvailable: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
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
const nameLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();

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

function localYmd(): string {
  return String(getProductTodayYmd());
}

function productTimeZone(): string {
  return String(getProductTime().context.timeZone);
}

function resetForm(): void {
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
  if (!canSubmit.value || props.saving) return;
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim() || null,
    trigger: buildTrigger(),
    profileIds: [...selectedProfileIds.value],
  });
}

function handleOpenChange(value: boolean): void {
  emit('update:open', value);
}
</script>
