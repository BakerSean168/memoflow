<!-- widgets/MonthDaySelector.vue -->
<template>
  <div class="w-full">
    <Label class="mb-2 block">{{ t('task.monthDay.title') }}</Label>
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="day in monthDayOptions"
        :key="day"
        type="button"
        size="sm"
        :variant="localSelected.includes(day) ? 'default' : 'outline'"
        :aria-pressed="localSelected.includes(day)"
        :data-testid="`month-day-option-${day}`"
        class="rounded-full select-none"
        @click="toggleDay(day)"
      >
        {{ day }}
      </Button>
    </div>

    <div class="mt-2 flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="ghost" @click="selectFirstHalf">
        {{ t('task.monthDay.firstHalf') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="selectSecondHalf">
        {{ t('task.monthDay.secondHalf') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="selectOddDays">
        {{ t('task.monthDay.oddDays') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="selectEvenDays">
        {{ t('task.monthDay.evenDays') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="selectAll">
        {{ t('task.monthDay.selectAll') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="clearAll">
        {{ t('task.monthDay.clear') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button, Label } from '@memoflow/ui-vue-shadcn';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  modelValue: number[];
}>();
const emit = defineEmits<{
  'update:modelValue': [value: number[]];
}>();

const localSelected = computed({
  get: () => props.modelValue || [],
  set: (value: number[]) => emit('update:modelValue', value),
});

// 生成1-31的日期选项
const monthDayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

const toggleDay = (day: number) => {
  const current = localSelected.value;
  if (current.includes(day)) {
    localSelected.value = current.filter((d) => d !== day);
  } else {
    localSelected.value = [...current, day];
  }
};

// 快捷选择方法
const selectFirstHalf = () => {
  localSelected.value = Array.from({ length: 15 }, (_, i) => i + 1); // 1-15
};

const selectSecondHalf = () => {
  localSelected.value = Array.from({ length: 16 }, (_, i) => i + 16); // 16-31
};

const selectOddDays = () => {
  localSelected.value = Array.from({ length: 16 }, (_, i) => i * 2 + 1); // 1,3,5,...,31
};

const selectEvenDays = () => {
  localSelected.value = Array.from({ length: 15 }, (_, i) => (i + 1) * 2); // 2,4,6,...,30
};

const selectAll = () => {
  localSelected.value = [...monthDayOptions];
};

const clearAll = () => {
  localSelected.value = [];
};
</script>
