<template>
  <Dialog :open="modelValue" @update:open="handleVisibleChange">
    <DialogContent
      class="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col overflow-hidden"
      data-testid="schedule-dialog"
    >
      <DialogHeader class="shrink-0">
        <DialogTitle>{{
          isEditing ? t('schedule.createDialog.titleEdit') : t('schedule.createDialog.titleCreate')
        }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ t('schedule.createDialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <form class="flex min-h-0 flex-1 flex-col gap-4" @submit.prevent="handleSubmit">
        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
          <!-- 标题 -->
          <div>
            <Label for="title">{{ t('schedule.createDialog.fieldTitle') }}</Label>
            <Input
              id="title"
              v-model="formData.title"
              :placeholder="t('schedule.createDialog.fieldTitlePlaceholder')"
              maxlength="200"
              required
              data-testid="schedule-title-input"
            />
            <p class="text-sm text-muted-foreground mt-1">{{ formData.title.length }}/200</p>
          </div>

          <!-- 描述 -->
          <div>
            <Label for="description">{{ t('schedule.createDialog.fieldDescription') }}</Label>
            <Textarea
              id="description"
              v-model="formData.description"
              :placeholder="t('schedule.createDialog.fieldDescriptionPlaceholder')"
              rows="3"
              maxlength="1000"
            />
            <p class="text-sm text-muted-foreground mt-1">{{ formData.description.length }}/1000</p>
          </div>

          <div class="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label for="all-day" class="text-sm font-medium">{{
                t('schedule.calendar.allDay')
              }}</Label>
            </div>
            <Switch
              id="all-day"
              :model-value="formData.allDay"
              @update:model-value="formData.allDay = $event"
            />
          </div>

          <!-- 开始时间 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="startDate">{{ t('schedule.createDialog.fieldStartDate') }}</Label>
              <Popover>
                <PopoverTrigger as-child>
                  <Button
                    variant="outline"
                    class="w-full justify-start text-left font-normal"
                    :class="{ 'text-muted-foreground': !formData.startDate }"
                  >
                    <CalendarIcon class="mr-2 h-4 w-4" />
                    {{
                      formData.startDate
                        ? formatDisplayDate(formData.startDate, locale)
                        : t('schedule.createDialog.fieldStartDate')
                    }}
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    :selected="parseToCalendarDate(formData.startDate)"
                    @update:model-value="
                      (d: unknown) =>
                        handleCalendarSelect(d, (v) => {
                          formData.startDate = v;
                        })
                    "
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div v-if="!formData.allDay">
              <Label for="startTime">{{ t('schedule.createDialog.fieldStartTime') }}</Label>
              <div class="flex gap-2 items-center">
                <Select
                  :model-value="startHour"
                  @update:model-value="
                    (v) => {
                      startHour = String(v);
                      syncStartTime();
                    }
                  "
                >
                  <SelectTrigger class="w-[80px]"><SelectValue placeholder="HH" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{ h }}</SelectItem>
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
                  <SelectTrigger class="w-[80px]"><SelectValue placeholder="MM" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <!-- 结束时间 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="endDate">{{ t('schedule.createDialog.fieldEndDate') }}</Label>
              <Popover>
                <PopoverTrigger as-child>
                  <Button
                    variant="outline"
                    class="w-full justify-start text-left font-normal"
                    :class="{ 'text-muted-foreground': !formData.endDate }"
                  >
                    <CalendarIcon class="mr-2 h-4 w-4" />
                    {{
                      formData.endDate
                        ? formatDisplayDate(formData.endDate, locale)
                        : t('schedule.createDialog.fieldEndDate')
                    }}
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    :selected="parseToCalendarDate(formData.endDate)"
                    @update:model-value="
                      (d: unknown) =>
                        handleCalendarSelect(d, (v) => {
                          formData.endDate = v;
                        })
                    "
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div v-if="!formData.allDay">
              <Label for="endTime">{{ t('schedule.createDialog.fieldEndTime') }}</Label>
              <div class="flex gap-2 items-center">
                <Select
                  :model-value="endHour"
                  @update:model-value="
                    (v) => {
                      endHour = String(v);
                      syncEndTime();
                    }
                  "
                >
                  <SelectTrigger class="w-[80px]"><SelectValue placeholder="HH" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{ h }}</SelectItem>
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
                  <SelectTrigger class="w-[80px]"><SelectValue placeholder="MM" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <!-- 自动检测冲突：当前 P4-2301A 仅 Timed range 参与兼容冲突检测 -->
          <div
            v-if="!formData.allDay"
            class="flex items-center justify-between rounded-lg border p-3"
          >
            <div>
              <Label for="auto-detect-conflicts" class="text-sm font-medium">{{
                t('schedule.createDialog.autoDetectConflicts')
              }}</Label>
              <p class="text-xs text-muted-foreground">
                {{ t('schedule.createDialog.autoDetectConflictsDescription') }}
              </p>
            </div>
            <Switch
              id="auto-detect-conflicts"
              :model-value="formData.autoDetectConflicts"
              @update:model-value="formData.autoDetectConflicts = $event"
            />
          </div>

          <!-- 地点 -->
          <div>
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
            <p class="text-sm text-muted-foreground mt-1">{{ formData.location.length }}/200</p>
          </div>

          <!-- 参与者 -->
          <div>
            <Label>{{ t('schedule.createDialog.fieldAttendees') }}</Label>
            <div class="flex flex-wrap gap-2 mb-2">
              <Badge
                v-for="(attendee, index) in formData.attendees"
                :key="index"
                variant="secondary"
                class="gap-1"
              >
                {{ attendee }}
                <button
                  type="button"
                  @click="removeAttendee(index)"
                  class="hover:bg-destructive/20 rounded-full"
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
        </div>

        <DialogFooter class="shrink-0">
          <Button type="button" variant="outline" :disabled="busy" @click="handleClose">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="busy" data-testid="schedule-save-button">
            <Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />
            {{ isEditing ? t('common.save') : t('common.create') }}
          </Button>
        </DialogFooter>
        <p v-if="submitError" role="alert" class="text-sm text-destructive">
          {{ submitError }}
        </p>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Popover,
  PopoverTrigger,
  PopoverContent,
  Calendar,
} from '@memoflow/ui-vue-shadcn';
import { MapPin, X, Loader2, Calendar as CalendarIcon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { parseToCalendarDate } from '../../../shared/utils/parse-to-date';
import { handleCalendarSelect } from '../../../shared/utils/handle-calendar-select';
import { formatDisplayDate } from '../../../shared/utils/format-display-date';
import { padTwoDigits } from '../../../shared/utils/pad-two-digits';
import { getProductTime } from '../../../shared/utils/product-time';
import type { CalendarEntryClientDTO, CreateScheduleRequest } from '@memoflow/contracts/schedule';

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

const isEditing = ref(false);
const newAttendee = ref('');

function nowDateStr(): string {
  const time = getProductTime();
  return String(time.calendar.toYmd(time.now()));
}
function nowTimeStr(): string {
  const time = getProductTime();
  return String(time.input.timeValue(time.now()));
}
function oneHourLaterTimeStr(): string {
  const time = getProductTime();
  return String(time.input.timeValue(time.now() + 60 * 60 * 1000));
}

const formData = reactive({
  title: '',
  description: '',
  startDate: nowDateStr(),
  startTime: nowTimeStr(),
  endDate: nowDateStr(),
  endTime: oneHourLaterTimeStr(),
  allDay: false,
  location: '',
  attendees: [] as string[],
  autoDetectConflicts: true,
});

// Initialize hour/minute refs from initial formData values
syncTimeRefs();

function resetForm() {
  formData.title = '';
  formData.description = '';
  formData.startDate = nowDateStr();
  formData.startTime = nowTimeStr();
  formData.endDate = nowDateStr();
  formData.endTime = oneHourLaterTimeStr();
  formData.allDay = false;
  formData.location = '';
  formData.attendees = [];
  formData.autoDetectConflicts = true;
  newAttendee.value = '';
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
      formData.startDate = nowDateStr();
      formData.startTime = nowTimeStr();
      formData.endDate = nowDateStr();
      formData.endTime = oneHourLaterTimeStr();
      formData.allDay = false;
      syncTimeRefs();
    }
  },
);
</script>
