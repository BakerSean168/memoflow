<template>
  <section class="divide-y divide-border/60" data-testid="routine-trigger-configuration">
    <div class="routine-property-row">
      <span class="routine-property-label">{{ t('routine.form.localTime') }}</span>
      <ProductTimePicker
        v-model="localTime"
        test-id="routine-local-time"
        :label="t('routine.form.localTime')"
        :hour-label="t('routine.form.hour')"
        :minute-label="t('routine.form.minute')"
        :disabled="disabled"
        class="ml-auto"
      />
    </div>

    <div class="routine-property-row">
      <span class="routine-property-label">{{ t('routine.form.startDate') }}</span>
      <ProductDatePicker
        :model-value="parseYmd(startDate)"
        :allowed-kinds="['day']"
        test-id="routine-start-date"
        :label="t('routine.form.startDate')"
        :aria-label="t('routine.form.startDate')"
        :disabled="disabled"
        class="ml-auto"
        @update:model-value="startDate = $event ?? ''"
      />
    </div>

    <div class="routine-property-row">
      <span class="routine-property-label">{{ t('routine.form.frequency') }}</span>
      <div class="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <ProductPropertyChip
              :disabled="disabled"
              :aria-label="t('routine.form.frequency')"
              data-testid="routine-frequency-chip"
            >
              <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
              {{ frequencyLabel }}
            </ProductPropertyChip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuRadioGroup :model-value="frequency" @update:model-value="updateFrequency">
              <DropdownMenuRadioItem
                v-for="option in frequencyOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="routine-property-row">
      <span class="routine-property-label">{{ t('routine.form.interval') }}</span>
      <div class="flex items-center justify-end gap-2">
        <NumberField
          v-model="recurrenceInterval"
          :min="1"
          :step="1"
          :disabled="disabled"
          data-testid="routine-recurrenceInterval"
          class="w-36"
        >
          <NumberFieldContent>
            <NumberFieldDecrement :aria-label="t('routine.form.interval') + ' −'" />
            <NumberFieldInput :aria-label="t('routine.form.interval')" class="h-8" />
            <NumberFieldIncrement :aria-label="t('routine.form.interval') + ' +'" />
          </NumberFieldContent>
        </NumberField>
        <span class="min-w-8 text-xs text-muted-foreground">{{ frequencyUnit }}</span>
      </div>
    </div>

    <div v-if="frequency === 'weekly'" class="routine-property-row">
      <span class="routine-property-label">{{ t('routine.form.weekdays') }}</span>
      <div class="flex flex-wrap justify-end gap-1">
        <button
          v-for="weekday in weekdayOptions"
          :key="weekday.value"
          type="button"
          class="h-7 min-w-7 rounded-md px-2 text-xs transition-colors"
          :class="
            selectedWeekdays.includes(weekday.value)
              ? 'bg-muted text-foreground'
              : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
          "
          :aria-pressed="selectedWeekdays.includes(weekday.value)"
          :disabled="disabled"
          @click="toggleWeekday(weekday.value)"
        >
          {{ weekday.label }}
        </button>
      </div>
    </div>

    <div class="routine-property-row">
      <span class="routine-property-label">{{ t('routine.form.timeZone') }}</span>
      <ProductTimeZoneSelector
        v-model="timeZone"
        test-id="routine-time-zone"
        :label="t('routine.form.timeZone')"
        :product-zone-label="t('routine.form.defaultTimeZone')"
        :search-placeholder="t('routine.form.searchTimeZones')"
        :empty-text="t('routine.form.noTimeZonesFound')"
        :disabled="disabled"
        class="ml-auto"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Repeat2 } from '@lucide/vue';
import { parseYmd } from '@memoflow/contracts/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@memoflow/ui-vue-shadcn';
import {
  ProductDatePicker,
  ProductPropertyChip,
  ProductTimePicker,
  ProductTimeZoneSelector,
} from '../../../shared/components';
import type { RoutineFrequency } from './routine-editor.types';

defineProps<{ disabled?: boolean }>();

const localTime = defineModel<string>('localTime', { required: true });
const startDate = defineModel<string>('startDate', { required: true });
const frequency = defineModel<RoutineFrequency>('frequency', { required: true });
const recurrenceInterval = defineModel<number>('recurrenceInterval', { required: true });
const selectedWeekdays = defineModel<number[]>('selectedWeekdays', { required: true });
const timeZone = defineModel<string>('timeZone', { required: true });
const { t } = useI18n();

const frequencyOptions = computed(() => [
  { value: 'daily' as const, label: t('routine.trigger.daily') },
  { value: 'weekly' as const, label: t('routine.trigger.weekly') },
  { value: 'monthly' as const, label: t('routine.trigger.monthly') },
  { value: 'yearly' as const, label: t('routine.trigger.yearly') },
]);
const frequencyLabel = computed(
  () => frequencyOptions.value.find((option) => option.value === frequency.value)?.label ?? '',
);
const weekdayOptions = computed(() => [
  { value: 1, label: t('routine.form.weekdaysShort.mon') },
  { value: 2, label: t('routine.form.weekdaysShort.tue') },
  { value: 3, label: t('routine.form.weekdaysShort.wed') },
  { value: 4, label: t('routine.form.weekdaysShort.thu') },
  { value: 5, label: t('routine.form.weekdaysShort.fri') },
  { value: 6, label: t('routine.form.weekdaysShort.sat') },
  { value: 0, label: t('routine.form.weekdaysShort.sun') },
]);
const frequencyUnit = computed(() => t(`routine.form.frequencyUnits.${frequency.value}`));

function updateFrequency(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = frequencyOptions.value.find((candidate) => candidate.value === value);
  if (option) frequency.value = option.value;
}

function toggleWeekday(weekday: number): void {
  selectedWeekdays.value = selectedWeekdays.value.includes(weekday)
    ? selectedWeekdays.value.filter((value) => value !== weekday)
    : [...selectedWeekdays.value, weekday];
}
</script>

<style scoped>
.routine-property-row {
  display: grid;
  grid-template-columns: minmax(7.5rem, 0.42fr) minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  padding-block: 0.75rem;
}

.routine-property-label {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 640px) {
  .routine-property-row {
    grid-template-columns: minmax(6.5rem, 0.45fr) minmax(0, 1fr);
    gap: 0.75rem;
  }
}
</style>
