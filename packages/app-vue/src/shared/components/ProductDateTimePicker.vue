<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogContent
      class="w-[23rem] max-w-[calc(100vw-1.25rem)] gap-0 overflow-hidden rounded-xl border-border/80 bg-[hsl(var(--surface-overlay))] p-0 shadow-2xl dark:border-white/10"
      :data-testid="testId"
    >
      <DialogHeader class="border-b border-border/60 px-5 pb-4 pt-5 text-left">
        <DialogTitle class="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <span
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"
          >
            <CalendarClock class="h-4 w-4" />
          </span>
          {{ title }}
        </DialogTitle>
        <DialogDescription v-if="description" class="pl-9 text-xs leading-5">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="p-4">
        <div class="rounded-xl border border-border/65 bg-background/35 p-3">
          <Calendar
            appearance="linear"
            v-model:placeholder="calendarPlaceholder"
            :model-value="selectedDate"
            :locale="productLocale"
            :week-starts-on="weekStartsOn"
            :weekday-format="'short'"
            :fixed-weeks="true"
            :min-value="minCalendarDate"
            :return-date="todayCalendarDate"
            :return-to-selected-label="returnToTodayLabel"
            @update:model-value="handleCalendarValue"
          />
        </div>

        <div
          class="mt-3 flex items-center gap-3 rounded-xl border border-border/65 bg-background/35 px-3 py-2.5"
        >
          <Clock3 class="h-4 w-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-foreground/85">{{ timeLabel }}</p>
            <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
              {{ timeZoneLabel }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-1.5" :aria-label="timeLabel">
            <Input
              ref="hourInput"
              v-model="hourDraft"
              type="text"
              inputmode="numeric"
              maxlength="2"
              class="h-8 w-11 rounded-md border-border/75 bg-muted/20 px-1 text-center text-sm tabular-nums shadow-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/35"
              :aria-label="hourLabel"
              @input="normalizeNumericDraft('hour')"
              @blur="normalizeClockPart('hour')"
              @keydown.up.prevent="adjustClockPart('hour', 1)"
              @keydown.down.prevent="adjustClockPart('hour', -1)"
            />
            <span class="text-sm font-medium text-muted-foreground">:</span>
            <Input
              v-model="minuteDraft"
              type="text"
              inputmode="numeric"
              maxlength="2"
              class="h-8 w-11 rounded-md border-border/75 bg-muted/20 px-1 text-center text-sm tabular-nums shadow-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/35"
              :aria-label="minuteLabel"
              @input="normalizeNumericDraft('minute')"
              @blur="normalizeClockPart('minute')"
              @keydown.up.prevent="adjustClockPart('minute', 1)"
              @keydown.down.prevent="adjustClockPart('minute', -1)"
            />
          </div>
        </div>

        <div class="mt-2 min-h-5 px-1">
          <p v-if="validationMessage" class="text-xs text-destructive" role="alert">
            {{ validationMessage }}
          </p>
          <p v-else-if="previewLabel" class="text-xs tabular-nums text-muted-foreground">
            {{ previewLabel }}
          </p>
        </div>
      </div>

      <DialogFooter
        class="border-t border-border/60 bg-muted/10 px-4 py-3 sm:justify-end sm:space-x-2"
      >
        <Button type="button" variant="ghost" size="sm" @click="setOpen(false)">
          {{ cancelLabel }}
        </Button>
        <Button
          type="button"
          size="sm"
          class="min-w-20"
          :disabled="disabled || !canApply"
          @click="apply"
        >
          {{ applyLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { CalendarClock, Clock3 } from '@lucide/vue';
import type { DateValue } from '@internationalized/date';
import type { Instant, Ymd } from '@memoflow/contracts/primitives';
import {
  Button,
  Calendar,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@memoflow/ui-vue-shadcn';
import { parseToCalendarDate } from '../utils/parse-to-date';
import { handleCalendarSelect } from '../utils/handle-calendar-select';
import {
  formatProductDateTime,
  getProductTime,
  getProductTodayYmd,
  productTimeRevision,
} from '../utils/product-time';

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type ClockPart = 'hour' | 'minute';

const props = withDefaults(
  defineProps<{
    modelValue: Instant | null;
    open: boolean;
    title: string;
    description?: string;
    timeLabel?: string;
    hourLabel?: string;
    minuteLabel?: string;
    cancelLabel?: string;
    applyLabel?: string;
    returnToTodayLabel?: string;
    invalidTimeText?: string;
    pastTimeText?: string;
    disabled?: boolean;
    minValue?: Instant | null;
    testId?: string;
  }>(),
  {
    description: '',
    timeLabel: 'Time',
    hourLabel: 'Hour',
    minuteLabel: 'Minute',
    cancelLabel: 'Cancel',
    applyLabel: 'Apply',
    returnToTodayLabel: 'Return to today',
    invalidTimeText: 'Choose a valid time.',
    pastTimeText: 'Choose a time in the future.',
    disabled: false,
    minValue: null,
    testId: 'product-date-time-picker',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: Instant | null];
  'update:open': [value: boolean];
  apply: [value: Instant];
}>();

const draftDate = ref<Ymd>(getProductTodayYmd());
const hourDraft = ref('09');
const minuteDraft = ref('00');
const calendarPlaceholder = shallowRef<DateValue | undefined>(parseToCalendarDate(draftDate.value));

const productLocale = computed(() => {
  void productTimeRevision.value;
  return getProductTime().presentation.locale;
});
const weekStartsOn = computed(() => {
  void productTimeRevision.value;
  return getProductTime().context.weekStartsOn as WeekStartsOn;
});
const timeZoneLabel = computed(() => {
  void productTimeRevision.value;
  return getProductTime().context.timeZone;
});
const todayCalendarDate = computed(() => {
  void productTimeRevision.value;
  return parseToCalendarDate(getProductTodayYmd());
});
const effectiveMinValue = computed(() => props.minValue ?? null);
const minCalendarDate = computed(() => {
  if (effectiveMinValue.value == null) return undefined;
  return parseToCalendarDate(getProductTime().calendar.toYmd(effectiveMinValue.value));
});
const selectedDate = computed(() => parseToCalendarDate(draftDate.value));

const hourValue = computed(() => parseClockPart(hourDraft.value, 23));
const minuteValue = computed(() => parseClockPart(minuteDraft.value, 59));
const clockValid = computed(() => hourValue.value != null && minuteValue.value != null);
const draftHm = computed(() =>
  clockValid.value
    ? `${String(hourValue.value).padStart(2, '0')}:${String(minuteValue.value).padStart(2, '0')}`
    : null,
);
const draftInstant = computed<Instant | null>(() => {
  if (!draftHm.value) return null;
  const value = getProductTime().input.combine(draftDate.value, draftHm.value);
  return value == null ? null : (Number(value) as Instant);
});
const isBeforeMinimum = computed(
  () =>
    draftInstant.value != null &&
    effectiveMinValue.value != null &&
    draftInstant.value <= effectiveMinValue.value,
);
const canApply = computed(
  () => draftInstant.value != null && clockValid.value && !isBeforeMinimum.value,
);
const validationMessage = computed(() => {
  if (!clockValid.value) return props.invalidTimeText;
  if (isBeforeMinimum.value) return props.pastTimeText;
  return '';
});
const previewLabel = computed(() =>
  draftInstant.value == null ? '' : formatProductDateTime(draftInstant.value),
);

watch(
  () => props.open,
  (open) => {
    if (open) seedDraft();
  },
);

function roundUpToFiveMinutes(value: number): Instant {
  const step = 5 * 60_000;
  return (Math.ceil(value / step) * step) as Instant;
}

function defaultDraftInstant(): Instant {
  const now = Number(getProductTime().now());
  const minimum = Number(props.minValue ?? now);
  return roundUpToFiveMinutes(Math.max(now, minimum) + 60 * 60_000);
}

function seedDraft(): void {
  const seed =
    props.modelValue != null && (props.minValue == null || props.modelValue > props.minValue)
      ? props.modelValue
      : defaultDraftInstant();
  draftDate.value = getProductTime().calendar.toYmd(seed);
  const hm = getProductTime().input.timeValue(seed) || '09:00';
  hourDraft.value = hm.slice(0, 2);
  minuteDraft.value = hm.slice(3, 5);
  calendarPlaceholder.value = parseToCalendarDate(draftDate.value);
}

function parseClockPart(raw: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function normalizeNumericDraft(part: ClockPart): void {
  const source = part === 'hour' ? hourDraft : minuteDraft;
  source.value = source.value.replace(/\D/g, '').slice(0, 2);
}

function normalizeClockPart(part: ClockPart): void {
  const source = part === 'hour' ? hourDraft : minuteDraft;
  const max = part === 'hour' ? 23 : 59;
  const parsed = parseClockPart(source.value, max);
  if (parsed == null) return;
  source.value = String(parsed).padStart(2, '0');
}

function adjustClockPart(part: ClockPart, delta: number): void {
  const source = part === 'hour' ? hourDraft : minuteDraft;
  const max = part === 'hour' ? 23 : 59;
  const current = parseClockPart(source.value, max) ?? 0;
  const range = max + 1;
  const next = (current + delta + range) % range;
  source.value = String(next).padStart(2, '0');
}

function handleCalendarValue(value: unknown): void {
  handleCalendarSelect(value, (ymd) => {
    if (!ymd) return;
    draftDate.value = ymd as Ymd;
  });
}

function setOpen(value: boolean): void {
  emit('update:open', value);
}

function apply(): void {
  if (!canApply.value || draftInstant.value == null) return;
  emit('update:modelValue', draftInstant.value);
  emit('apply', draftInstant.value);
  emit('update:open', false);
}
</script>
