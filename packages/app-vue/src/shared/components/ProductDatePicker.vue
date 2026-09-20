<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <ProductPropertyChip
        v-if="variant === 'chip'"
        :disabled="disabled"
        :data-testid="testId"
        :aria-label="ariaLabel"
      >
        <template #icon><CalendarDays class="h-3.5 w-3.5" /></template>
        {{ triggerLabel }}
      </ProductPropertyChip>
      <Button
        v-else
        type="button"
        variant="outline"
        class="w-full justify-start text-left font-normal"
        :class="{ 'text-muted-foreground': !modelValue }"
        :disabled="disabled"
        :data-testid="testId"
        :aria-label="ariaLabel"
      >
        <CalendarDays class="mr-2 h-4 w-4" />
        {{ resolvedLabel || label }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] p-0">
      <div class="space-y-2 border-b border-border/70 p-3">
        <p class="text-sm font-medium">{{ label }}</p>
        <Input
          v-model="query"
          :placeholder="inputPlaceholder"
          :data-testid="`${testId}-query`"
          :aria-label="ariaLabel"
          @keydown.enter.prevent="commitQuery"
        />
        <p v-if="parseError" class="text-xs text-destructive" role="alert">{{ invalidText }}</p>
        <p v-else class="text-[11px] text-muted-foreground">{{ formatHint }}</p>
      </div>

      <div class="p-2">
        <Calendar
          mode="single"
          :selected="selectedDate"
          @update:model-value="handleCalendarValue"
        />
      </div>

      <div class="flex items-center justify-between border-t border-border/70 px-3 py-2">
        <span class="truncate text-xs text-muted-foreground">{{ resolvedLabel }}</span>
        <Button v-if="modelValue" type="button" variant="ghost" size="sm" @click="clear">
          {{ clearLabel }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarDays } from '@lucide/vue';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  Button,
  Calendar,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import ProductPropertyChip from './ProductPropertyChip.vue';
import { handleCalendarSelect } from '../utils/handle-calendar-select';
import { parseToCalendarDate } from '../utils/parse-to-date';
import { formatProductYmd } from '../utils/product-time';
import {
  parseExplicitProductDateInput,
  parsedProductDateStartYmd,
} from '../utils/parse-explicit-product-date';

const props = withDefaults(
  defineProps<{
    modelValue: Ymd | null;
    label: string;
    placeholder?: string;
    inputPlaceholder?: string;
    formatHint?: string;
    invalidText?: string;
    clearLabel?: string;
    testId?: string;
    ariaLabel?: string;
    disabled?: boolean;
    variant?: 'chip' | 'field';
  }>(),
  {
    placeholder: '',
    inputPlaceholder: 'Try: 2027/05/20, May 2027, Q4 2027',
    formatHint: 'YYYY-MM-DD · May 2027 · Q4 2027 · 2027',
    invalidText: 'Enter a supported date format.',
    clearLabel: 'Clear',
    testId: 'product-date-picker',
    ariaLabel: 'Choose date',
    disabled: false,
    variant: 'chip',
  },
);
const emit = defineEmits<{ 'update:modelValue': [Ymd | null] }>();

const open = ref(false);
const query = ref('');
const parseError = ref(false);

const selectedDate = computed(() =>
  props.modelValue ? parseToCalendarDate(props.modelValue) : undefined,
);
const resolvedLabel = computed(() =>
  props.modelValue ? formatProductYmd(props.modelValue) : props.placeholder,
);
const triggerLabel = computed(() =>
  props.modelValue
    ? `${props.label}: ${formatProductYmd(props.modelValue)}`
    : props.placeholder || props.label,
);

watch(
  () => props.modelValue,
  (value) => {
    query.value = value ?? '';
    parseError.value = false;
  },
  { immediate: true },
);

function commitQuery(): void {
  const parsed = parseExplicitProductDateInput(query.value);
  if (!parsed) {
    parseError.value = true;
    return;
  }
  parseError.value = false;
  const value = parsedProductDateStartYmd(parsed);
  emit('update:modelValue', value);
  query.value = value;
}

function handleCalendarValue(value: unknown): void {
  handleCalendarSelect(value, (ymd) => {
    parseError.value = false;
    query.value = ymd;
    emit('update:modelValue', (ymd || null) as Ymd | null);
  });
}

function clear(): void {
  parseError.value = false;
  query.value = '';
  emit('update:modelValue', null);
}
</script>
