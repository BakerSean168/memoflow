<template>
  <Dialog :open="modelValue" @update:open="handleVisibleChange">
    <ProductDialogShell
      :open="modelValue"
      test-id="schedule-dialog"
      size="md"
      initial-focus-selector="[data-testid='schedule-title-input']"
    >
      <template #title>
        {{
          isEditing ? t('schedule.createDialog.titleEdit') : t('schedule.createDialog.titleCreate')
        }}
      </template>
      <template #description>{{ t('schedule.createDialog.description') }}</template>

      <form id="schedule-form" class="space-y-5" @submit.prevent="handleSubmit">
        <div class="border-b pb-4">
          <Label for="title" class="sr-only">{{ t('schedule.createDialog.fieldTitle') }}</Label>
          <Input
            id="title"
            v-model="formData.title"
            :placeholder="t('schedule.createDialog.fieldTitlePlaceholder')"
            maxlength="200"
            required
            data-testid="schedule-title-input"
            class="h-11 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring/30"
          />
          <Label for="description" class="sr-only">{{
            t('schedule.createDialog.fieldDescription')
          }}</Label>
          <Textarea
            id="description"
            v-model="formData.description"
            :placeholder="t('schedule.createDialog.fieldDescriptionPlaceholder')"
            rows="2"
            maxlength="1000"
            class="min-h-12 resize-none border-0 bg-transparent px-0 py-1 text-sm text-muted-foreground shadow-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring/30"
          />
        </div>

        <div class="space-y-3">
          <div
            class="flex flex-wrap items-center gap-2"
            data-testid="schedule-property-chips"
            aria-label="Schedule properties"
          >
            <ProductPropertyChip
              data-testid="schedule-when-chip"
              :active="activeProperty === 'when'"
              @click="toggleProperty('when')"
            >
              <template #icon><CalendarClock class="h-3.5 w-3.5" /></template>
              {{ whenChipLabel }}
            </ProductPropertyChip>

            <ProductPropertyChip
              data-testid="schedule-location-chip"
              :active="activeProperty === 'location'"
              @click="toggleProperty('location')"
            >
              <template #icon><MapPin class="h-3.5 w-3.5" /></template>
              {{ locationChipLabel }}
            </ProductPropertyChip>

            <ProductPropertyChip
              data-testid="schedule-attendees-chip"
              :active="activeProperty === 'attendees'"
              @click="toggleProperty('attendees')"
            >
              <template #icon><Users class="h-3.5 w-3.5" /></template>
              {{ attendeesChipLabel }}
            </ProductPropertyChip>

            <ProductPropertyChip
              data-testid="schedule-conflict-chip"
              :active="activeProperty === 'conflict'"
              :disabled="formData.allDay"
              @click="toggleProperty('conflict')"
            >
              <template #icon><ShieldCheck class="h-3.5 w-3.5" /></template>
              {{ conflictChipLabel }}
            </ProductPropertyChip>
          </div>

          <div
            v-if="activeProperty"
            class="rounded-xl border bg-muted/20 p-4"
            data-testid="schedule-property-editor"
          >
            <div v-if="activeProperty === 'when'" class="space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <Label for="all-day" class="text-sm font-medium">{{
                    t('schedule.calendar.allDay')
                  }}</Label>
                  <p class="mt-0.5 text-xs text-muted-foreground">{{ whenChipLabel }}</p>
                </div>
                <Switch
                  id="all-day"
                  :model-value="formData.allDay"
                  @update:model-value="formData.allDay = $event"
                />
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="startDate">{{ t('schedule.createDialog.fieldStartDate') }}</Label>
                  <ProductDatePicker
                    v-model="startDateModel"
                    variant="field"
                    :label="t('schedule.createDialog.fieldStartDate')"
                    :placeholder="t('schedule.createDialog.fieldStartDate')"
                    :input-placeholder="t('common.productDateInputPlaceholder')"
                    :format-hint="t('common.productDateInputHint')"
                    :invalid-text="t('common.productDateInputInvalid')"
                    :clear-label="t('common.clear')"
                    test-id="schedule-start-date"
                    :aria-label="t('schedule.createDialog.fieldStartDate')"
                  />
                  <div v-if="!formData.allDay" class="flex items-center gap-2">
                    <Select
                      :model-value="startHour"
                      @update:model-value="
                        (v) => {
                          startHour = String(v);
                          syncStartTime();
                        }
                      "
                    >
                      <SelectTrigger class="w-[80px]"
                        ><SelectValue placeholder="HH"
                      /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{
                          h
                        }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <span class="font-medium">:</span>
                    <Select
                      :model-value="startMinute"
                      @update:model-value="
                        (v) => {
                          startMinute = String(v);
                          syncStartTime();
                        }
                      "
                    >
                      <SelectTrigger class="w-[80px]"
                        ><SelectValue placeholder="MM"
                      /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{
                          m
                        }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div class="space-y-2">
                  <Label for="endDate">{{ t('schedule.createDialog.fieldEndDate') }}</Label>
                  <ProductDatePicker
                    v-model="endDateModel"
                    variant="field"
                    :label="t('schedule.createDialog.fieldEndDate')"
                    :placeholder="t('schedule.createDialog.fieldEndDate')"
                    :input-placeholder="t('common.productDateInputPlaceholder')"
                    :format-hint="t('common.productDateInputHint')"
                    :invalid-text="t('common.productDateInputInvalid')"
                    :clear-label="t('common.clear')"
                    test-id="schedule-end-date"
                    :aria-label="t('schedule.createDialog.fieldEndDate')"
                  />
                  <div v-if="!formData.allDay" class="flex items-center gap-2">
                    <Select
                      :model-value="endHour"
                      @update:model-value="
                        (v) => {
                          endHour = String(v);
                          syncEndTime();
                        }
                      "
                    >
                      <SelectTrigger class="w-[80px]"
                        ><SelectValue placeholder="HH"
                      /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{
                          h
                        }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <span class="font-medium">:</span>
                    <Select
                      :model-value="endMinute"
                      @update:model-value="
                        (v) => {
                          endMinute = String(v);
                          syncEndTime();
                        }
                      "
                    >
                      <SelectTrigger class="w-[80px]"
                        ><SelectValue placeholder="MM"
                      /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{
                          m
                        }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeProperty === 'location'" class="space-y-2">
              <Label for="location">{{ t('schedule.createDialog.fieldLocation') }}</Label>
              <div class="relative">
                <MapPin class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="location"
                  v-model="formData.location"
                  :placeholder="t('schedule.createDialog.fieldLocationPlaceholder')"
                  class="pl-10"
                  maxlength="200"
                />
              </div>
            </div>

            <div v-else-if="activeProperty === 'attendees'" class="space-y-3">
              <Label>{{ t('schedule.createDialog.fieldAttendees') }}</Label>
              <div v-if="formData.attendees.length > 0" class="flex flex-wrap gap-2">
                <Badge
                  v-for="(attendee, index) in formData.attendees"
                  :key="attendee"
                  variant="secondary"
                  class="gap-1"
                >
                  {{ attendee }}
                  <button
                    type="button"
                    :aria-label="`${t('common.delete')} ${attendee}`"
                    class="rounded-full hover:bg-destructive/20"
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
                  @keydown.enter.prevent="addAttendee"
                />
                <Button type="button" variant="outline" size="sm" @click="addAttendee">
                  {{ t('schedule.createDialog.addAttendee') }}
                </Button>
              </div>
            </div>

            <div
              v-else-if="activeProperty === 'conflict'"
              class="flex items-center justify-between gap-4"
            >
              <div>
                <Label for="auto-detect-conflicts" class="text-sm font-medium">{{
                  t('schedule.createDialog.autoDetectConflicts')
                }}</Label>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ t('schedule.createDialog.autoDetectConflictsDescription') }}
                </p>
              </div>
              <Switch
                id="auto-detect-conflicts"
                :model-value="formData.autoDetectConflicts"
                @update:model-value="formData.autoDetectConflicts = $event"
              />
            </div>
          </div>
        </div>

        <p v-if="submitError" role="alert" class="text-sm text-destructive">
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
          :disabled="busy"
          data-testid="schedule-save-button"
        >
          <Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />
          {{ isEditing ? t('common.save') : t('common.create') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue';
import {
  Dialog,
  Input,
  Textarea,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Switch,
} from '@memoflow/ui-vue-shadcn';
import { CalendarClock, MapPin, ShieldCheck, Users, X, Loader2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  ProductDatePicker,
  ProductDialogShell,
  ProductPropertyChip,
} from '../../../shared/components';
import { formatDisplayDate } from '../../../shared/utils/format-display-date';
import { padTwoDigits } from '../../../shared/utils/pad-two-digits';
import { getProductTime } from '../../../shared/utils/product-time';
import type { CalendarEntryClientDTO, CreateScheduleRequest } from '@memoflow/contracts/schedule';
import { requireYmd, type Ymd } from '@memoflow/contracts/primitives';

interface Props {
  modelValue: boolean;
  schedule?: CalendarEntryClientDTO | null;
  loading?: boolean;
  onSubmit: (data: CreateScheduleRequest) => Promise<boolean>;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  schedule: null,
  loading: false,
});

const emit = defineEmits<Emits>();

const { t, locale } = useI18n();
const submitting = ref(false);
const submitError = ref('');
const busy = computed(() => props.loading || submitting.value);

// TIME-1206: schedule date fields use canonical Ymd plus CalendarDate boundary adapters; no Date -> Ymd compatibility path remains.

// ── Time picker options ────────────────────────────────────────────────
/** Residual 1312: hour/minute option pad dual retired onto padTwoDigits sole. */
const hourOptions = Array.from({ length: 24 }, (_, i) => padTwoDigits(i));
const minuteOptions = Array.from({ length: 60 }, (_, i) => padTwoDigits(i));

// ── Calendar/DateTime helpers ──────────────────────────────────────────

/** Split HH:MM string into hour/minute parts */
function splitTime(timeStr: string): { hour: string; minute: string } {
  if (!timeStr) return { hour: '00', minute: '00' };
  const [h, m] = timeStr.split(':');
  return { hour: h || '00', minute: m || '00' };
}

// ── Time select state ──────────────────────────────────────────────────
const startHour = ref('00');
const startMinute = ref('00');
const endHour = ref('00');
const endMinute = ref('00');

function syncStartTime() {
  formData.startTime = `${startHour.value}:${startMinute.value}`;
}

function syncEndTime() {
  formData.endTime = `${endHour.value}:${endMinute.value}`;
}

/** Sync the hour/minute refs from formData.startTime / endTime */
function syncTimeRefs() {
  const st = splitTime(formData.startTime);
  startHour.value = st.hour;
  startMinute.value = st.minute;
  const et = splitTime(formData.endTime);
  endHour.value = et.hour;
  endMinute.value = et.minute;
}

type ScheduleProperty = 'when' | 'location' | 'attendees' | 'conflict';
const activeProperty = ref<ScheduleProperty | null>(null);
const isEditing = ref(false);
const newAttendee = ref('');

const DEFAULT_TIMED_DURATION_MS = 60 * 60 * 1000;

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
  },
});
const endDateModel = computed<Ymd | null>({
  get: () => (formData.endDate ? requireYmd(formData.endDate) : null),
  set: (value) => {
    formData.endDate = value ?? '';
  },
});

// Initialize hour/minute refs from initial formData values
syncTimeRefs();

const whenChipLabel = computed(() => {
  const start = formatDisplayDate(formData.startDate, locale.value);
  const end = formatDisplayDate(formData.endDate, locale.value);
  if (formData.allDay) {
    return formData.startDate === formData.endDate
      ? `${start} · ${t('schedule.calendar.allDay')}`
      : `${start} – ${end} · ${t('schedule.calendar.allDay')}`;
  }
  return formData.startDate === formData.endDate
    ? `${start} · ${formData.startTime}–${formData.endTime}`
    : `${start} ${formData.startTime} – ${end} ${formData.endTime}`;
});
const locationChipLabel = computed(
  () => formData.location.trim() || t('schedule.createDialog.fieldLocation'),
);
const attendeesChipLabel = computed(() =>
  formData.attendees.length > 0
    ? `${t('schedule.createDialog.fieldAttendees')} · ${formData.attendees.length}`
    : t('schedule.createDialog.fieldAttendees'),
);
const conflictChipLabel = computed(
  () =>
    `${t('schedule.createDialog.autoDetectConflicts')} · ${
      formData.autoDetectConflicts
        ? t('schedule.planning.enabled')
        : t('schedule.planning.disabled')
    }`,
);

function toggleProperty(property: ScheduleProperty): void {
  activeProperty.value = activeProperty.value === property ? null : property;
}

function resetForm() {
  formData.title = '';
  formData.description = '';
  const defaultRange = defaultTimedRangeFields();
  formData.startDate = defaultRange.startDate;
  formData.startTime = defaultRange.startTime;
  formData.endDate = defaultRange.endDate;
  formData.endTime = defaultRange.endTime;
  formData.allDay = false;
  formData.location = '';
  formData.attendees = [];
  formData.autoDetectConflicts = true;
  newAttendee.value = '';
  activeProperty.value = null;
  syncTimeRefs();
}

function handleClose() {
  if (busy.value) return;
  emit('update:modelValue', false);
  resetForm();
  submitError.value = '';
}

function handleVisibleChange(value: boolean) {
  if (!value) handleClose();
}

function addAttendee() {
  if (newAttendee.value.trim() && !formData.attendees.includes(newAttendee.value.trim())) {
    formData.attendees.push(newAttendee.value.trim());
    newAttendee.value = '';
  }
}

function removeAttendee(index: number) {
  formData.attendees.splice(index, 1);
}

async function handleSubmit() {
  if (busy.value) return;
  const time = getProductTime();
  const startDate = time.input.parseDateValue(formData.startDate);
  const endDate = time.input.parseDateValue(formData.endDate);
  if (startDate == null || endDate == null) {
    alert(t('schedule.confirm.endBeforeStart'));
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
    alert(t('schedule.confirm.endBeforeStart'));
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
    if (schedule) {
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
        formData.startDate = time.input.dateValue(schedule.range.start);
        formData.startTime = time.input.timeValue(schedule.range.start);
        formData.endDate = time.input.dateValue(schedule.range.end);
        formData.endTime = time.input.timeValue(schedule.range.end);
      }
      syncTimeRefs();
    } else {
      isEditing.value = false;
      resetForm();
    }
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      resetForm();
    } else if (!props.schedule) {
      const defaultRange = defaultTimedRangeFields();
      formData.startDate = defaultRange.startDate;
      formData.startTime = defaultRange.startTime;
      formData.endDate = defaultRange.endDate;
      formData.endTime = defaultRange.endTime;
      formData.allDay = false;
      syncTimeRefs();
    }
  },
);
</script>
