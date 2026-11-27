<template>
  <ProductEditorFrame
    v-if="presentation === 'panel'"
    presentation="panel"
    :open="open"
    :test-id="testId"
    :title-id="testId + '-title'"
    pane-size="picker"
    pane-height-mode="content"
    initial-focus-selector="input"
    @update:open="setOpen"
  >
    <template #title>{{ title }}</template>
    <template v-if="description" #description>{{ description }}</template>
    <ProductDateTimePickerFields
      v-model:calendar-placeholder="calendarPlaceholder"
      :selected-date="selectedDate"
      :product-locale="productLocale"
      :week-starts-on="weekStartsOn"
      :min-calendar-date="minCalendarDate"
      :today-calendar-date="todayCalendarDate"
      :return-to-today-label="returnToTodayLabel"
      :time-label="timeLabel"
      :time-zone-label="timeZoneLabel"
      :time-value="seededTime"
      :time-sync-key="timeSyncKey"
      :hour-label="hourLabel"
      :minute-label="minuteLabel"
      :disabled="disabled"
      :validation-message="validationMessage"
      :preview-label="previewLabel"
      @select-day="handleCalendarValue"
      @update:time-draft="handleTimeDraft"
    />
    <template #footer>
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
    </template>
  </ProductEditorFrame>
  <Dialog v-else :open="open" @update:open="setOpen">
    <DialogContent
      v-bind="description ? {} : { 'aria-describedby': undefined }"
      class="w-[23rem] max-w-[calc(100vw-1.25rem)] gap-0 overflow-hidden rounded-xl border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-0 shadow-[0_24px_64px_-26px_rgba(0,0,0,0.62),0_6px_18px_-12px_rgba(0,0,0,0.44),inset_0_1px_0_hsl(var(--foreground)/0.025)]"
      :data-testid="testId"
    >
      <DialogHeader
        class="border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.42)] px-5 pb-4 pt-5 text-left"
      >
        <DialogTitle class="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <span
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--surface-raised)/0.66)] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]"
          >
            <CalendarClock class="h-4 w-4" />
          </span>
          {{ title }}
        </DialogTitle>
        <DialogDescription v-if="description" class="pl-8 text-xs leading-5">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <ProductDateTimePickerFields
        v-model:calendar-placeholder="calendarPlaceholder"
        :selected-date="selectedDate"
        :product-locale="productLocale"
        :week-starts-on="weekStartsOn"
        :min-calendar-date="minCalendarDate"
        :today-calendar-date="todayCalendarDate"
        :return-to-today-label="returnToTodayLabel"
        :time-label="timeLabel"
        :time-zone-label="timeZoneLabel"
        :time-value="seededTime"
        :time-sync-key="timeSyncKey"
        :hour-label="hourLabel"
        :minute-label="minuteLabel"
        :disabled="disabled"
        :validation-message="validationMessage"
        :preview-label="previewLabel"
        @select-day="handleCalendarValue"
        @update:time-draft="handleTimeDraft"
      />

      <DialogFooter
        class="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.42)] px-4 py-3 sm:justify-end sm:space-x-2"
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
import { CalendarClock } from '@lucide/vue';
import type { DateValue } from '@internationalized/date';
import type { Instant, Ymd } from '@memoflow/shared-primitives';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type SegmentedTimeDraft,
} from '@memoflow/ui-vue-shadcn';
import { parseToCalendarDate } from '../utils/parse-to-date';
import ProductEditorFrame from './ProductEditorFrame.vue';
import ProductDateTimePickerFields from './ProductDateTimePickerFields.vue';
import { handleCalendarSelect } from '../utils/handle-calendar-select';
import {
  formatProductDateTime,
  getProductTime,
  getProductTodayYmd,
  productTimeRevision,
} from '../utils/product-time';

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const props = withDefaults(
  defineProps<{
    modelValue: Instant | null;
    open: boolean;
    presentation?: 'dialog' | 'panel';
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
    presentation: 'dialog',
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
const seededTime = ref('09:00');
const timeSyncKey = ref(0);
const timeDraft = ref<SegmentedTimeDraft>({
  hour: '09',
  minute: '00',
  second: '00',
  valid: true,
  value: '09:00',
});
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

const clockValid = computed(() => timeDraft.value.valid);
const draftHm = computed(() => timeDraft.value.value);
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
  { immediate: true },
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
  seededTime.value = hm;
  timeSyncKey.value += 1;
  timeDraft.value = {
    hour: hm.slice(0, 2),
    minute: hm.slice(3, 5),
    second: '00',
    valid: true,
    value: hm,
  };
  calendarPlaceholder.value = parseToCalendarDate(draftDate.value);
}

function handleTimeDraft(draft: SegmentedTimeDraft): void {
  timeDraft.value = draft;
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
  if (props.disabled || !props.open || !canApply.value || draftInstant.value == null) return;
  emit('update:modelValue', draftInstant.value);
  emit('apply', draftInstant.value);
  emit('update:open', false);
}
</script>
