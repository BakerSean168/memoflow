<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <ProductDialogShell
      :open="open"
      test-id="routine-editor-dialog"
      size="lg"
      initial-focus-selector="[data-testid='routine-name-input']"
    >
      <template #icon><Repeat2 class="mt-0.5 h-5 w-5 text-primary" /></template>
      <template #title>{{ routine ? t('routine.edit') : t('routine.create') }}</template>
      <template #description>{{ t('routine.description') }}</template>

      <form id="routine-editor-form" class="space-y-5" @submit.prevent="submit">
        <div class="grid gap-4 @2xl/panel:grid-cols-2">
          <div class="space-y-2">
            <Label for="routine-name">{{ t('routine.form.name') }}</Label>
            <Input
              id="routine-name"
              v-model="name"
              data-testid="routine-name-input"
              maxlength="200"
              :disabled="saving"
            />
          </div>
          <div class="space-y-2">
            <Label for="routine-trigger-type">{{ t('routine.form.triggerType') }}</Label>
            <select
              id="routine-trigger-type"
              v-model="triggerType"
              data-testid="routine-trigger-type"
              class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :disabled="saving"
            >
              <option value="None">{{ t('routine.form.none') }}</option>
              <option value="WallClock">{{ t('routine.form.wallClock') }}</option>
              <option value="Elapsed">{{ t('routine.form.elapsed') }}</option>
              <option value="ActiveUsage">{{ t('routine.form.activeUsage') }}</option>
            </select>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="routine-description">{{ t('routine.form.description') }}</Label>
          <Textarea
            id="routine-description"
            v-model="description"
            rows="3"
            :disabled="saving"
          />
        </div>

        <div v-if="triggerType === 'WallClock'" class="rounded-lg border border-border p-4">
          <div class="grid gap-4 @2xl/panel:grid-cols-2">
            <div class="space-y-2">
              <Label for="routine-local-time">{{ t('routine.form.localTime') }}</Label>
              <Input id="routine-local-time" v-model="localTime" type="time" :disabled="saving" />
            </div>
            <div class="space-y-2">
              <Label for="routine-time-zone">{{ t('routine.form.timeZone') }}</Label>
              <Input id="routine-time-zone" v-model="timeZone" :disabled="saving" />
            </div>
            <div class="space-y-2">
              <Label for="routine-start-date">{{ t('routine.form.startDate') }}</Label>
              <Input id="routine-start-date" v-model="startDate" type="date" :disabled="saving" />
            </div>
            <div class="space-y-2">
              <Label for="routine-frequency">{{ t('routine.form.frequency') }}</Label>
              <select
                id="routine-frequency"
                v-model="frequency"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :disabled="saving"
              >
                <option value="daily">{{ t('routine.trigger.daily') }}</option>
                <option value="weekly">{{ t('routine.trigger.weekly') }}</option>
                <option value="monthly">{{ t('routine.trigger.monthly') }}</option>
                <option value="yearly">{{ t('routine.trigger.yearly') }}</option>
              </select>
            </div>
            <div class="space-y-2">
              <Label for="routine-frequency-interval">{{ t('routine.form.interval') }}</Label>
              <Input
                id="routine-frequency-interval"
                v-model.number="recurrenceInterval"
                type="number"
                min="1"
                step="1"
                :disabled="saving"
              />
            </div>
            <div v-if="frequency === 'weekly'" class="space-y-2">
              <Label for="routine-weekdays">{{ t('routine.form.weekdays') }}</Label>
              <Input id="routine-weekdays" v-model="weekdaysText" placeholder="1,2,3,4,5" :disabled="saving" />
            </div>
          </div>
          <p class="mt-3 text-xs text-muted-foreground">{{ t('routine.trigger.schedulerRuntime') }}</p>
        </div>

        <div v-else-if="triggerType === 'Elapsed'" class="rounded-lg border border-border p-4">
          <div class="grid gap-4 @2xl/panel:grid-cols-2">
            <div class="space-y-2">
              <Label for="routine-duration-minutes">{{ t('routine.form.durationMinutes') }}</Label>
              <Input
                id="routine-duration-minutes"
                v-model.number="durationMinutes"
                type="number"
                min="1"
                step="1"
                :disabled="saving"
              />
            </div>
            <div class="space-y-2">
              <Label for="routine-elapsed-anchor">{{ t('routine.form.anchor') }}</Label>
              <select
                id="routine-elapsed-anchor"
                v-model="elapsedAnchor"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :disabled="saving"
              >
                <option value="last-satisfied">{{ t('routine.trigger.lastSatisfied') }}</option>
                <option value="routine-activation">{{ t('routine.trigger.routineActivation') }}</option>
                <option value="profile-activation">{{ t('routine.trigger.profileActivation') }}</option>
              </select>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted-foreground">{{ t('routine.trigger.desktopRuntime') }}</p>
        </div>

        <div v-else-if="triggerType === 'ActiveUsage'" class="rounded-lg border border-border p-4">
          <div class="grid gap-4 @2xl/panel:grid-cols-2">
            <div class="space-y-2">
              <Label for="routine-active-minutes">{{ t('routine.form.activeMinutes') }}</Label>
              <Input
                id="routine-active-minutes"
                v-model.number="activeMinutes"
                type="number"
                min="1"
                step="1"
                :disabled="saving"
              />
            </div>
            <div class="space-y-2">
              <Label for="routine-natural-break">{{ t('routine.form.naturalBreakMinutes') }}</Label>
              <Input
                id="routine-natural-break"
                v-model.number="naturalBreakMinutes"
                type="number"
                min="0"
                step="1"
                :disabled="saving"
              />
            </div>
            <div class="space-y-2 @2xl/panel:col-span-2">
              <Label for="routine-active-anchor">{{ t('routine.form.anchor') }}</Label>
              <select
                id="routine-active-anchor"
                v-model="activeAnchor"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :disabled="saving"
              >
                <option value="last-satisfied">{{ t('routine.trigger.lastSatisfied') }}</option>
                <option value="profile-activation">{{ t('routine.trigger.profileActivation') }}</option>
              </select>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted-foreground">{{ t('routine.trigger.desktopRuntime') }}</p>
        </div>

        <div class="space-y-2">
          <Label>{{ t('routine.form.profiles') }}</Label>
          <div v-if="profiles.length" class="grid gap-2 @2xl/panel:grid-cols-2">
            <label
              v-for="profile in profiles"
              :key="profile.id"
              class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <input
                v-model="selectedProfileIds"
                type="checkbox"
                :value="profile.id"
                :data-testid="`routine-profile-membership-${profile.id}`"
                :disabled="saving"
                class="h-4 w-4 rounded border-input"
              />
              <span class="min-w-0 flex-1 truncate">{{ profile.name }}</span>
              <Badge v-if="profile.active" variant="secondary">{{ t('routine.profile.active') }}</Badge>
            </label>
          </div>
          <p v-else class="text-xs text-muted-foreground">{{ t('routine.profile.noProfiles') }}</p>
        </div>
      </form>

      <template #footer>
        <Button type="button" variant="ghost" data-testid="routine-editor-cancel" :disabled="saving" @click="emit('update:open', false)">
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
import { Repeat2 } from '@lucide/vue';
import { Badge, Button, Dialog, Input, Label, Textarea } from '@memoflow/ui-vue-shadcn';
import type {
  RoutineDefinitionDto,
  RoutineProfileDto,
  RoutineTriggerDto,
} from '@memoflow/contracts/routine';
import { parseTimeZoneId, parseYmd, requireTimeZoneId, requireYmd } from '@memoflow/contracts/primitives';
import { ProductDialogShell } from '../../../shared/components';
import { getProductTime, getProductTodayYmd } from '../../../shared/utils/product-time';

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
  }>(),
  {
    saving: false,
    routine: null,
    membershipProfileIds: () => [],
    preset: null,
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
const triggerType = ref<'None' | RoutineTriggerDto['type']>('None');
const localTime = ref('09:00');
const timeZone = ref('UTC');
const startDate = ref('2026-01-01');
const frequency = ref<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
const recurrenceInterval = ref(1);
const weekdaysText = ref('');
const durationMinutes = ref(50);
const elapsedAnchor = ref<'routine-activation' | 'profile-activation' | 'last-satisfied'>(
  'last-satisfied',
);
const activeMinutes = ref(50);
const naturalBreakMinutes = ref(5);
const activeAnchor = ref<'profile-activation' | 'last-satisfied'>('last-satisfied');
const selectedProfileIds = ref<string[]>([]);

function localYmd(): string {
  return String(getProductTodayYmd());
}

function browserTimeZone(): string {
  return String(getProductTime().context.timeZone);
}

function resetForm(): void {
  const source = props.routine;
  const preset = props.preset;
  name.value = source?.name ?? preset?.name ?? '';
  description.value = source?.description ?? preset?.description ?? '';
  selectedProfileIds.value = [...props.membershipProfileIds];

  const trigger = source?.trigger ?? preset?.trigger ?? null;
  triggerType.value = trigger?.type ?? 'None';
  localTime.value = trigger?.type === 'WallClock' ? trigger.localTime : '09:00';
  timeZone.value = trigger?.type === 'WallClock' ? trigger.timeZone : browserTimeZone();
  startDate.value =
    trigger?.type === 'WallClock' ? trigger.recurrence.startDate : localYmd();
  frequency.value =
    trigger?.type === 'WallClock' ? trigger.recurrence.frequency : 'daily';
  recurrenceInterval.value =
    trigger?.type === 'WallClock' ? trigger.recurrence.interval : 1;
  weekdaysText.value =
    trigger?.type === 'WallClock' ? trigger.recurrence.byWeekday.join(',') : '';
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
      localTime.value &&
        parseTimeZoneId(timeZone.value.trim()) &&
        parseYmd(startDate.value) &&
        recurrenceInterval.value > 0,
    );
  }
  if (triggerType.value === 'Elapsed') return durationMinutes.value > 0;
  if (triggerType.value === 'ActiveUsage') return activeMinutes.value > 0;
  return true;
});

function parseWeekdays(): number[] {
  if (!weekdaysText.value.trim()) return [];
  const values = weekdaysText.value
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return [...new Set(values)];
}

function buildTrigger(): RoutineTriggerDto | null {
  if (triggerType.value === 'None') return null;
  if (triggerType.value === 'WallClock') {
    return {
      type: 'WallClock',
      timingOwner: 'scheduler',
      localTime: localTime.value,
      timeZone: requireTimeZoneId(timeZone.value.trim()),
      recurrence: {
        startDate: requireYmd(startDate.value),
        frequency: frequency.value,
        interval: Math.max(1, Math.trunc(recurrenceInterval.value)),
        byWeekday: parseWeekdays(),
        count: null,
        until: null,
      },
    };
  }
  if (triggerType.value === 'Elapsed') {
    return {
      type: 'Elapsed',
      timingOwner: 'local-runtime',
      durationMs: Math.max(1, durationMinutes.value) * 60_000,
      anchor: elapsedAnchor.value,
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
