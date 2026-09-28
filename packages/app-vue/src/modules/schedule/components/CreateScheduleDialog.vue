<template>
  <Dialog :open="modelValue" @update:open="handleVisibleChange">
    <ProductDialogShell
      :open="modelValue"
      test-id="schedule-dialog"
      size="md"
      content-class="sm:max-w-[620px]"
      initial-focus-selector="[data-testid='schedule-title-input']"
    >
      <template #icon>
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <CalendarPlus2 class="h-4.5 w-4.5" />
        </span>
      </template>

      <template #title>
        {{
          isEditing ? t('schedule.createDialog.titleEdit') : t('schedule.createDialog.titleCreate')
        }}
      </template>
      <template #description>{{ t('schedule.createDialog.description') }}</template>

      <form id="schedule-form" class="space-y-4" @submit.prevent="handleSubmit">
        <section class="border-b border-border/60 pb-4" data-testid="schedule-identity-section">
          <Label for="title" class="sr-only">{{ t('schedule.createDialog.fieldTitle') }}</Label>
          <Input
            id="title"
            v-model="formData.title"
            :placeholder="t('schedule.createDialog.fieldTitlePlaceholder')"
            maxlength="200"
            required
            data-testid="schedule-title-input"
            class="h-10 border-0 bg-transparent px-0 text-xl font-semibold tracking-[-0.015em] shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
          />

          <Label for="description" class="sr-only">
            {{ t('schedule.createDialog.fieldDescription') }}
          </Label>
          <Textarea
            id="description"
            v-model="formData.description"
            :placeholder="t('schedule.createDialog.fieldDescriptionPlaceholder')"
            rows="2"
            maxlength="1000"
            class="min-h-11 resize-none border-0 bg-transparent px-0 py-1 text-sm leading-5 text-foreground/80 shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
          />
        </section>

        <section
          class="rounded-xl border border-border/60 bg-muted/[0.08] p-3.5"
          data-testid="schedule-time-panel"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <CalendarClock class="h-4 w-4" />
            </span>

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ t('schedule.createDialog.timeSection') }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ formData.allDay ? whenSummary : durationLabel }}
              </p>
            </div>

            <label
              class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
              for="all-day"
            >
              {{ t('schedule.calendar.allDay') }}
              <Switch
                id="all-day"
                :model-value="formData.allDay"
                @update:model-value="setAllDay"
              />
            </label>
          </div>

          <div v-if="formData.allDay" class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <div class="space-y-1.5">
              <p class="text-[11px] font-medium text-muted-foreground">
                {{ t('schedule.createDialog.fieldStartDate') }}
              </p>
              <ProductDatePicker
                v-model="startDateModel"
                variant="field"
                :label="t('schedule.createDialog.fieldStartDate')"
                :placeholder="t('schedule.createDialog.fieldStartDate')"
                :input-placeholder="t('schedule.createDialog.exactDateInputPlaceholder')"
                :format-hint="t('schedule.createDialog.exactDateInputHint')"
                :invalid-text="t('schedule.createDialog.exactDateInputInvalid')"
                :clear-label="t('common.clear')"
                :allowed-kinds="['day']"
                test-id="schedule-start-date"
                :aria-label="t('schedule.createDialog.fieldStartDate')"
              />
            </div>

            <ArrowRight class="hidden h-4 w-4 self-end text-muted-foreground/70 sm:block sm:mb-2.5" />

            <div class="space-y-1.5">
              <p class="text-[11px] font-medium text-muted-foreground">
                {{ t('schedule.createDialog.fieldEndDate') }}
              </p>
              <ProductDatePicker
                v-model="endDateModel"
                variant="field"
                :label="t('schedule.createDialog.fieldEndDate')"
                :placeholder="t('schedule.createDialog.fieldEndDate')"
                :input-placeholder="t('schedule.createDialog.exactDateInputPlaceholder')"
                :format-hint="t('schedule.createDialog.exactDateInputHint')"
                :invalid-text="t('schedule.createDialog.exactDateInputInvalid')"
                :clear-label="t('common.clear')"
                :allowed-kinds="['day']"
                test-id="schedule-end-date"
                :aria-label="t('schedule.createDialog.fieldEndDate')"
              />
            </div>
          </div>

          <div v-else class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <button
              type="button"
              class="group min-w-0 rounded-lg border border-border/60 bg-background/55 px-3 py-2.5 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              data-testid="schedule-start-time-button"
              @click="startPickerOpen = true"
            >
              <span class="block text-[11px] font-medium text-muted-foreground">
                {{ t('schedule.createDialog.fieldStartTime') }}
              </span>
              <span class="mt-0.5 block truncate text-sm font-medium tabular-nums">
                {{ timedStartLabel }}
              </span>
            </button>

            <ArrowRight class="hidden h-4 w-4 self-center text-muted-foreground/70 sm:block" />

            <button
              type="button"
              class="group min-w-0 rounded-lg border border-border/60 bg-background/55 px-3 py-2.5 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              data-testid="schedule-end-time-button"
              @click="endPickerOpen = true"
            >
              <span class="block text-[11px] font-medium text-muted-foreground">
                {{ t('schedule.createDialog.fieldEndTime') }}
              </span>
              <span class="mt-0.5 block truncate text-sm font-medium tabular-nums">
                {{ timedEndLabel }}
              </span>
            </button>
          </div>
        </section>

        <section class="space-y-3" data-testid="schedule-optional-section">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground/75">
              {{ t('schedule.createDialog.optionalDetails') }}
            </p>
          </div>

          <div
            class="flex flex-wrap items-center gap-2"
            data-testid="schedule-property-chips"
            :aria-label="t('schedule.createDialog.optionalDetails')"
          >
            <ProductPropertyChip
              data-testid="schedule-location-chip"
              :active="activeProperty === 'location' || Boolean(formData.location.trim())"
              @click="toggleProperty('location')"
            >
              <template #icon><MapPin class="h-3.5 w-3.5" /></template>
              {{ locationChipLabel }}
            </ProductPropertyChip>

            <ProductPropertyChip
              data-testid="schedule-attendees-chip"
              :active="activeProperty === 'attendees' || formData.attendees.length > 0"
              @click="toggleProperty('attendees')"
            >
              <template #icon><Users class="h-3.5 w-3.5" /></template>
              {{ attendeesChipLabel }}
            </ProductPropertyChip>
          </div>

          <div
            v-if="activeProperty"
            class="border-t border-border/55 pt-3"
            data-testid="schedule-property-editor"
          >
            <div v-if="activeProperty === 'location'" class="space-y-2">
              <Label for="location" class="text-xs text-muted-foreground">
                {{ t('schedule.createDialog.fieldLocation') }}
              </Label>
              <div class="relative">
                <MapPin class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="location"
                  v-model="formData.location"
                  :placeholder="t('schedule.createDialog.fieldLocationPlaceholder')"
                  class="h-9 border-border/60 bg-muted/10 pl-9 shadow-none"
                  maxlength="200"
                />
              </div>
            </div>

            <div v-else class="space-y-2.5">
              <div v-if="formData.attendees.length > 0" class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="(attendee, index) in formData.attendees"
                  :key="attendee"
                  variant="secondary"
                  class="h-7 gap-1 rounded-full px-2.5 font-normal"
                >
                  {{ attendee }}
                  <button
                    type="button"
                    :aria-label="`${t('common.delete')} ${attendee}`"
                    class="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    @click="removeAttendee(index)"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </Badge>
              </div>

              <div class="flex gap-2">
                <Input
                  v-model="newAttendee"
                  :placeholder="t('schedule.createDialog.fieldAttendeePlaceholder')"
                  class="h-9 border-border/60 bg-muted/10 shadow-none"
                  @keydown.enter.prevent="addAttendee"
                />
                <Button type="button" variant="outline" size="sm" class="h-9" @click="addAttendee">
                  <Plus class="mr-1 h-3.5 w-3.5" />
                  {{ t('schedule.createDialog.addAttendee') }}
                </Button>
              </div>
            </div>
          </div>

          <div
            v-if="!formData.allDay"
            class="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 px-3 py-2.5"
            data-testid="schedule-conflict-setting"
          >
            <ShieldCheck class="h-4 w-4 shrink-0 text-success" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ t('schedule.createDialog.autoDetectConflicts') }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ t('schedule.createDialog.autoDetectConflictsDescription') }}
              </p>
            </div>
            <Switch
              id="auto-detect-conflicts"
              :model-value="formData.autoDetectConflicts"
              @update:model-value="formData.autoDetectConflicts = $event"
            />
          </div>
        </section>

        <p
          v-if="submitError"
          role="alert"
          class="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {{ submitError }}
        </p>
      </form>

      <template #footer>
        <Button type="button" variant="ghost" :disabled="busy" @click="handleClose">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="schedule-form"
          class="min-w-20"
          :disabled="busy"
          data-testid="schedule-save-button"
        >
          <Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />
          {{ isEditing ? t('common.save') : t('common.create') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>

  <ProductDateTimePicker
    :open="startPickerOpen"
    :model-value="timedStartInstant"
    :title="t('schedule.createDialog.startPickerTitle')"
    :description="t('schedule.createDialog.startPickerDescription')"
    :time-label="t('schedule.createDialog.clockTime')"
    :hour-label="t('schedule.createDialog.hour')"
    :minute-label="t('schedule.createDialog.minute')"
    :cancel-label="t('common.cancel')"
    :apply-label="t('common.confirm')"
    :return-to-today-label="t('schedule.createDialog.returnToToday')"
    :invalid-time-text="t('schedule.createDialog.invalidClockTime')"
    test-id="schedule-start-date-time-picker"
    @update:open="startPickerOpen = $event"
    @apply="applyStartInstant"
  />

  <ProductDateTimePicker
    :open="endPickerOpen"
    :model-value="timedEndInstant"
    :min-value="timedStartInstant"
    :title="t('schedule.createDialog.endPickerTitle')"
    :description="t('schedule.createDialog.endPickerDescription')"
    :time-label="t('schedule.createDialog.clockTime')"
    :hour-label="t('schedule.createDialog.hour')"
    :minute-label="t('schedule.createDialog.minute')"
    :cancel-label="t('common.cancel')"
    :apply-label="t('common.confirm')"
    :return-to-today-label="t('schedule.createDialog.returnToToday')"
    :invalid-time-text="t('schedule.createDialog.invalidClockTime')"
    :past-time-text="t('schedule.createDialog.endAfterStart')"
    test-id="schedule-end-date-time-picker"
    @update:open="endPickerOpen = $event"
    @apply="applyEndInstant"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus2,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Users,
  X,
} from '@lucide/vue';
import {
  Badge,
  Button,
  Dialog,
  Input,
  Label,
  Switch,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import type { CalendarEntryClientDTO, CreateScheduleRequest } from '@memoflow/contracts/schedule';
import { requireYmd, type Instant, type Ymd } from '@memoflow/contracts/primitives';
import {
  ProductDatePicker,
  ProductDateTimePicker,
  ProductDialogShell,
  ProductPropertyChip,
} from '../../../shared/components';
import { formatDisplayDate } from '../../../shared/utils/format-display-date';
import {
  formatProductDateTime,
  getProductTime,
} from '../../../shared/utils/product-time';

type ScheduleProperty = 'location' | 'attendees';

interface InitialScheduleRange {
  start: number;
  end: number;
  allDay: boolean;
}

interface Props {
  modelValue: boolean;
  schedule?: CalendarEntryClientDTO | null;
  initialRange?: InitialScheduleRange | null;
  loading?: boolean;
  onSubmit: (data: CreateScheduleRequest) => Promise<boolean>;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  schedule: null,
  initialRange: null,
  loading: false,
});

const emit = defineEmits<Emits>();
const { t, locale } = useI18n();

const DEFAULT_TIMED_DURATION_MS = 60 * 60 * 1000;
const submitting = ref(false);
const submitError = ref('');
const busy = computed(() => props.loading || submitting.value);
const startPickerOpen = ref(false);
const endPickerOpen = ref(false);
const activeProperty = ref<ScheduleProperty | null>(null);
const isEditing = ref(false);
const newAttendee = ref('');

function defaultTimedRangeFields(): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const time = getProductTime();
  const start = time.now();
  const end = start + DEFAULT_TIMED_DURATION_MS;
  return {
    startDate: String(time.calendar.toYmd(start)),
    startTime: String(time.input.timeValue(start)),
    endDate: String(time.calendar.toYmd(end)),
    endTime: String(time.input.timeValue(end)),
  };
}

const initialTimedRange = defaultTimedRangeFields();
const formData = reactive({
  title: '',
  description: '',
  ...initialTimedRange,
  allDay: false,
  location: '',
  attendees: [] as string[],
  autoDetectConflicts: true,
});

const startDateModel = computed<Ymd | null>({
  get: () => (formData.startDate ? requireYmd(formData.startDate) : null),
  set: (value) => {
    formData.startDate = value ?? '';
    if (formData.endDate && formData.startDate > formData.endDate) {
      formData.endDate = formData.startDate;
    }
  },
});

const endDateModel = computed<Ymd | null>({
  get: () => (formData.endDate ? requireYmd(formData.endDate) : null),
  set: (value) => {
    formData.endDate = value ?? '';
  },
});

function combineTimed(dateValue: string, hm: string): Instant | null {
  const time = getProductTime();
  const date = time.input.parseDateValue(dateValue);
  if (date == null) return null;
  const instant = time.input.combine(date, hm);
  return instant == null ? null : (Number(instant) as Instant);
}

const timedStartInstant = computed<Instant | null>(() =>
  combineTimed(formData.startDate, formData.startTime),
);
const timedEndInstant = computed<Instant | null>(() =>
  combineTimed(formData.endDate, formData.endTime),
);

const timedStartLabel = computed(() =>
  timedStartInstant.value == null ? '—' : formatProductDateTime(timedStartInstant.value),
);
const timedEndLabel = computed(() =>
  timedEndInstant.value == null ? '—' : formatProductDateTime(timedEndInstant.value),
);

const durationLabel = computed(() => {
  if (
    timedStartInstant.value == null ||
    timedEndInstant.value == null ||
    timedEndInstant.value <= timedStartInstant.value
  ) {
    return t('schedule.createDialog.invalidRange');
  }

  const totalMinutes = Math.round(
    (Number(timedEndInstant.value) - Number(timedStartInstant.value)) / 60_000,
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return t('schedule.duration.hoursMinutes', { h: hours, m: minutes });
  }
  if (hours > 0) return t('schedule.duration.hours', { h: hours });
  return t('schedule.duration.minutes', { n: totalMinutes });
});

const whenSummary = computed(() => {
  const start = formatDisplayDate(formData.startDate, locale.value);
  const end = formatDisplayDate(formData.endDate, locale.value);
  return formData.startDate === formData.endDate ? start : `${start} – ${end}`;
});

const locationChipLabel = computed(
  () => formData.location.trim() || t('schedule.createDialog.addLocation'),
);
const attendeesChipLabel = computed(() =>
  formData.attendees.length > 0
    ? t('schedule.createDialog.attendeeCount', { count: formData.attendees.length })
    : t('schedule.createDialog.addAttendees'),
);

function setInstantFields(target: 'start' | 'end', value: number): void {
  const time = getProductTime();
  const date = String(time.input.dateValue(value));
  const hm = String(time.input.timeValue(value));

  if (target === 'start') {
    formData.startDate = date;
    formData.startTime = hm;
  } else {
    formData.endDate = date;
    formData.endTime = hm;
  }
}

function applyStartInstant(value: number): void {
  const previousStart = timedStartInstant.value;
  const previousEnd = timedEndInstant.value;
  const duration =
    previousStart != null && previousEnd != null && previousEnd > previousStart
      ? Number(previousEnd) - Number(previousStart)
      : DEFAULT_TIMED_DURATION_MS;

  setInstantFields('start', value);

  if (previousEnd == null || Number(previousEnd) <= value) {
    setInstantFields('end', value + duration);
  }
}

function applyEndInstant(value: number): void {
  setInstantFields('end', value);
}

function setAllDay(value: boolean): void {
  formData.allDay = value;
  if (value) {
    if (!formData.endDate || formData.endDate < formData.startDate) {
      formData.endDate = formData.startDate;
    }
    return;
  }

  if (
    timedStartInstant.value == null ||
    timedEndInstant.value == null ||
    timedEndInstant.value <= timedStartInstant.value
  ) {
    const time = getProductTime();
    const startDate = time.input.parseDateValue(formData.startDate);
    if (startDate == null) return;
    const start = time.input.combine(startDate, formData.startTime || '09:00');
    if (start == null) return;
    setInstantFields('end', Number(start) + DEFAULT_TIMED_DURATION_MS);
  }
}

function toggleProperty(property: ScheduleProperty): void {
  activeProperty.value = activeProperty.value === property ? null : property;
}

function seedDefaultRange(): void {
  const defaultRange = defaultTimedRangeFields();
  formData.startDate = defaultRange.startDate;
  formData.startTime = defaultRange.startTime;
  formData.endDate = defaultRange.endDate;
  formData.endTime = defaultRange.endTime;
  formData.allDay = false;
}

function seedInitialRange(range: InitialScheduleRange): void {
  const time = getProductTime();

  if (range.allDay) {
    formData.allDay = true;
    formData.startDate = String(time.calendar.toYmd(range.start));
    const inclusiveEnd = Math.max(range.start, range.end - 1);
    formData.endDate = String(time.calendar.toYmd(inclusiveEnd));
    return;
  }

  const end = range.end > range.start ? range.end : range.start + DEFAULT_TIMED_DURATION_MS;
  formData.allDay = false;
  setInstantFields('start', range.start);
  setInstantFields('end', end);
}

function resetForm(): void {
  formData.title = '';
  formData.description = '';
  seedDefaultRange();
  formData.location = '';
  formData.attendees = [];
  formData.autoDetectConflicts = true;
  newAttendee.value = '';
  activeProperty.value = null;
  startPickerOpen.value = false;
  endPickerOpen.value = false;
}

function handleClose(): void {
  if (busy.value) return;
  emit('update:modelValue', false);
  resetForm();
  submitError.value = '';
}

function handleVisibleChange(value: boolean): void {
  if (!value) handleClose();
}

function addAttendee(): void {
  const attendee = newAttendee.value.trim();
  if (!attendee || formData.attendees.includes(attendee)) return;
  formData.attendees.push(attendee);
  newAttendee.value = '';
}

function removeAttendee(index: number): void {
  formData.attendees.splice(index, 1);
}

async function handleSubmit(): Promise<void> {
  if (busy.value) return;
  const time = getProductTime();
  const startDate = time.input.parseDateValue(formData.startDate);
  const endDate = time.input.parseDateValue(formData.endDate);

  if (startDate == null || endDate == null) {
    submitError.value = t('schedule.createDialog.invalidRange');
    return;
  }

  const range: CreateScheduleRequest['range'] | null = formData.allDay
    ? {
        kind: 'AllDay',
        start: startDate,
        end: startDate === endDate ? null : endDate,
      }
    : (() => {
        const start = time.input.combine(startDate, formData.startTime);
        const end = time.input.combine(endDate, formData.endTime);
        if (start == null || end == null || start >= end) return null;
        return { kind: 'Timed' as const, start, end };
      })();

  if (range == null || (range.kind === 'AllDay' && range.end != null && range.start > range.end)) {
    submitError.value = t('schedule.createDialog.invalidRange');
    return;
  }

  submitError.value = '';
  submitting.value = true;
  try {
    const saved = await props.onSubmit({
      name: formData.title,
      description: formData.description || undefined,
      range,
      location: formData.location || undefined,
      attendees: formData.attendees.length > 0 ? formData.attendees : undefined,
      autoDetectConflicts: range.kind === 'Timed' && formData.autoDetectConflicts,
    });

    if (saved) {
      emit('update:modelValue', false);
      resetForm();
      return;
    }

    submitError.value = t('schedule.createDialog.submitFailed');
  } catch {
    submitError.value = t('schedule.createDialog.submitFailed');
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.schedule,
  (schedule) => {
    if (!schedule) {
      isEditing.value = false;
      return;
    }

    isEditing.value = true;
    formData.title = schedule.title;
    formData.description = schedule.description || '';
    formData.location = schedule.location || '';
    formData.attendees = schedule.attendees ? [...schedule.attendees] : [];

    const time = getProductTime();
    if (schedule.range.kind === 'AllDay') {
      formData.allDay = true;
      formData.startDate = schedule.range.start;
      formData.endDate = schedule.range.end ?? schedule.range.start;
    } else {
      formData.allDay = false;
      formData.startDate = String(time.input.dateValue(schedule.range.start));
      formData.startTime = String(time.input.timeValue(schedule.range.start));
      formData.endDate = String(time.input.dateValue(schedule.range.end));
      formData.endTime = String(time.input.timeValue(schedule.range.end));
    }
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;

    submitError.value = '';
    if (props.schedule) return;

    isEditing.value = false;
    resetForm();
    if (props.initialRange) seedInitialRange(props.initialRange);
  },
  { immediate: true },
);
</script>
