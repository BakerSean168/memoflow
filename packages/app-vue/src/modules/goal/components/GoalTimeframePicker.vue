<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-8 max-w-full justify-start gap-1.5 rounded-full px-3 font-normal"
        :disabled="disabled"
        :data-testid="testId"
        :aria-label="ariaLabel"
      >
        <CalendarRange class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ triggerLabel }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-3">
      <div class="space-y-1">
        <p class="text-sm font-medium">{{ t('goal.dialog.target') }}</p>
        <p class="text-xs text-muted-foreground">{{ t('goal.dialog.targetPrecisionHint') }}</p>
      </div>

      <ToggleGroup
        :model-value="kind"
        type="single"
        variant="outline"
        class="grid grid-cols-5"
        @update:model-value="selectKind"
      >
        <ToggleGroupItem value="day" class="px-2 text-xs">{{
          t('goal.dialog.targetDay')
        }}</ToggleGroupItem>
        <ToggleGroupItem value="month" class="px-2 text-xs">{{
          t('goal.dialog.targetMonth')
        }}</ToggleGroupItem>
        <ToggleGroupItem value="quarter" class="px-2 text-xs">{{
          t('goal.dialog.targetQuarter')
        }}</ToggleGroupItem>
        <ToggleGroupItem value="halfYear" class="px-2 text-xs">{{
          t('goal.dialog.targetHalfYear')
        }}</ToggleGroupItem>
        <ToggleGroupItem value="year" class="px-2 text-xs">{{
          t('goal.dialog.targetYear')
        }}</ToggleGroupItem>
      </ToggleGroup>

      <Input
        v-if="kind === 'day'"
        v-model="dayValue"
        type="date"
        :data-testid="`${testId}-day`"
        @update:model-value="commitDay"
      />
      <Input
        v-else-if="kind === 'month'"
        v-model="monthValue"
        type="month"
        :data-testid="`${testId}-month`"
        @update:model-value="commitMonth"
      />
      <div v-else-if="kind === 'quarter'" class="grid grid-cols-[1fr_8rem] gap-2">
        <Input
          v-model.number="yearValue"
          type="number"
          min="1"
          max="9999"
          :aria-label="t('goal.dialog.targetYear')"
          @update:model-value="commitQuarter"
        />
        <Select v-model="quarterValue" @update:model-value="commitQuarter">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Q1</SelectItem>
            <SelectItem value="2">Q2</SelectItem>
            <SelectItem value="3">Q3</SelectItem>
            <SelectItem value="4">Q4</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div v-else-if="kind === 'halfYear'" class="grid grid-cols-[1fr_8rem] gap-2">
        <Input
          v-model.number="yearValue"
          type="number"
          min="1"
          max="9999"
          :aria-label="t('goal.dialog.targetYear')"
          @update:model-value="commitHalfYear"
        />
        <Select v-model="halfValue" @update:model-value="commitHalfYear">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">H1</SelectItem>
            <SelectItem value="2">H2</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        v-else
        v-model.number="yearValue"
        type="number"
        min="1"
        max="9999"
        :aria-label="t('goal.dialog.targetYear')"
        @update:model-value="commitYear"
      />

      <div class="flex items-center justify-between gap-2 pt-1">
        <span class="min-w-0 truncate text-xs text-muted-foreground">{{ resolvedLabel }}</span>
        <Button type="button" variant="ghost" size="sm" @click="clearTarget">
          {{ t('common.clear') }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarRange } from '@lucide/vue';
import {
  goalTimeframeLabel,
  type GoalTimeframe,
  type GoalTimeframeKind,
} from '@memoflow/contracts/goal';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@memoflow/ui-vue-shadcn';
import { fromProductYmdInputValue, getProductTodayYmd } from '../../../shared/utils/product-time';

const props = withDefaults(
  defineProps<{
    modelValue: GoalTimeframe | null;
    disabled?: boolean;
    testId?: string;
    ariaLabel?: string;
    placeholder?: string;
  }>(),
  {
    disabled: false,
    testId: 'goal-target-chip',
    ariaLabel: 'Target timeframe',
    placeholder: '',
  },
);
const emit = defineEmits<{ 'update:modelValue': [GoalTimeframe | null] }>();
const { t, locale } = useI18n();
const open = ref(false);
const kind = ref<GoalTimeframeKind>('day');
const dayValue = ref('');
const monthValue = ref('');
const yearValue = ref(1);
const quarterValue = ref('1');
const halfValue = ref('1');

function todayYear(): number {
  return Number(getProductTodayYmd().slice(0, 4));
}

function sync(target: GoalTimeframe | null): void {
  if (!target) {
    kind.value = 'day';
    dayValue.value = '';
    monthValue.value = '';
    yearValue.value = todayYear();
    quarterValue.value = '1';
    halfValue.value = '1';
    return;
  }
  kind.value = target.kind;
  if (target.kind === 'day') {
    dayValue.value = target.date;
    yearValue.value = Number(target.date.slice(0, 4));
  } else if (target.kind === 'month') {
    yearValue.value = target.year;
    monthValue.value = `${String(target.year).padStart(4, '0')}-${String(target.month).padStart(2, '0')}`;
  } else if (target.kind === 'quarter') {
    yearValue.value = target.year;
    quarterValue.value = String(target.quarter);
  } else if (target.kind === 'halfYear') {
    yearValue.value = target.year;
    halfValue.value = String(target.half);
  } else {
    yearValue.value = target.year;
  }
}

watch(() => props.modelValue, sync, { immediate: true, deep: true });

const resolvedLabel = computed(() =>
  props.modelValue ? goalTimeframeLabel(props.modelValue, locale.value) : t('goal.detail.notSet'),
);
const triggerLabel = computed(() =>
  props.modelValue
    ? `${t('goal.list.target')}: ${goalTimeframeLabel(props.modelValue, locale.value)}`
    : props.placeholder || t('goal.dialog.target'),
);

function emitTarget(target: GoalTimeframe | null): void {
  emit('update:modelValue', target);
}

function validYear(): number | null {
  const year = Number(yearValue.value);
  return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null;
}

function selectKind(value: unknown): void {
  if (typeof value !== 'string' || !value) return;
  kind.value = value as GoalTimeframeKind;
  if (kind.value === 'day') {
    commitDay();
  } else if (kind.value === 'month') {
    if (!monthValue.value)
      monthValue.value = `${String(validYear() ?? todayYear()).padStart(4, '0')}-01`;
    commitMonth();
  } else if (kind.value === 'quarter') commitQuarter();
  else if (kind.value === 'halfYear') commitHalfYear();
  else commitYear();
}

function commitDay(): void {
  const date = fromProductYmdInputValue(dayValue.value);
  emitTarget(date ? { kind: 'day', date } : null);
}

function commitMonth(): void {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue.value);
  if (!match) return emitTarget(null);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return emitTarget(null);
  emitTarget({ kind: 'month', year, month });
}

function commitQuarter(): void {
  const year = validYear();
  const quarter = Number(quarterValue.value);
  if (!year || ![1, 2, 3, 4].includes(quarter)) return;
  emitTarget({ kind: 'quarter', year, quarter });
}

function commitHalfYear(): void {
  const year = validYear();
  const half = Number(halfValue.value);
  if (!year || (half !== 1 && half !== 2)) return;
  emitTarget({ kind: 'halfYear', year, half });
}

function commitYear(): void {
  const year = validYear();
  if (year) emitTarget({ kind: 'year', year });
}

function clearTarget(): void {
  emitTarget(null);
  sync(null);
}
</script>
