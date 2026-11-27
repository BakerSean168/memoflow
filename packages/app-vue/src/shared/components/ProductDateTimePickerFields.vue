<script setup lang="ts">
import { Clock3 } from '@lucide/vue';
import { useId } from 'vue';
import type { DateValue } from '@internationalized/date';
import { Calendar, SegmentedTimeInput, type SegmentedTimeDraft } from '@memoflow/ui-vue-shadcn';

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const validationId = useId();

// The same calendar/time controls are mounted in the legacy global dialog and
// in the Schedule business-pane picker. Date arithmetic remains with the owner.
defineProps<{
  calendarPlaceholder?: DateValue;
  selectedDate?: DateValue;
  productLocale: string;
  weekStartsOn: WeekStartsOn;
  minCalendarDate?: DateValue;
  todayCalendarDate?: DateValue;
  returnToTodayLabel: string;
  timeLabel: string;
  timeZoneLabel: string;
  timeValue: string;
  timeSyncKey: number;
  hourLabel: string;
  minuteLabel: string;
  disabled?: boolean;
  validationMessage: string;
  previewLabel: string;
}>();
const emit = defineEmits<{
  'update:calendarPlaceholder': [DateValue | undefined];
  'update:timeDraft': [SegmentedTimeDraft];
  'select-day': [unknown];
}>();
</script>

<template>
  <div class="px-0">
    <div
      class="rounded-xl bg-[hsl(var(--surface-raised)/0.28)] p-3 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]"
    >
      <Calendar
        appearance="linear"
        :placeholder="calendarPlaceholder"
        @update:placeholder="emit('update:calendarPlaceholder', $event)"
        :model-value="selectedDate"
        :locale="productLocale"
        :week-starts-on="weekStartsOn"
        :weekday-format="'short'"
        :fixed-weeks="true"
        :min-value="minCalendarDate"
        :return-date="todayCalendarDate"
        :return-to-selected-label="returnToTodayLabel"
        @update:model-value="emit('select-day', $event)"
      />
    </div>

    <div
      class="mt-3 flex items-center gap-3 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]"
    >
      <Clock3 class="h-4 w-4 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-foreground/85">{{ timeLabel }}</p>
        <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
          {{ timeZoneLabel }}
        </p>
      </div>

      <SegmentedTimeInput
        class="shrink-0"
        :model-value="timeValue"
        :sync-key="timeSyncKey"
        :restore-invalid-on-blur="false"
        :label="timeLabel"
        :hour-label="hourLabel"
        :minute-label="minuteLabel"
        :disabled="disabled"
        :invalid="Boolean(validationMessage)"
        :aria-describedby="validationMessage ? validationId : undefined"
        test-id="product-date-time-picker-time"
        input-class="border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.34)] shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/45"
        @update:draft="emit('update:timeDraft', $event)"
      />
    </div>

    <div class="mt-2 min-h-5 px-1" aria-live="polite">
      <p
        v-if="validationMessage"
        :id="validationId"
        :title="validationMessage"
        class="truncate text-xs leading-5 text-[hsl(var(--foreground-muted))]"
        role="alert"
      >
        {{ validationMessage }}
      </p>
      <p
        v-else-if="previewLabel"
        :title="previewLabel"
        class="truncate text-xs leading-5 tabular-nums text-muted-foreground"
      >
        {{ previewLabel }}
      </p>
    </div>
  </div>
</template>
