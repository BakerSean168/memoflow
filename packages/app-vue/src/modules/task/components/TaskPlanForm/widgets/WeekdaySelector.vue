<!-- widgets/WeekdaySelector.vue -->
<template>
  <div class="w-full">
    <Label class="mb-2 block">{{ t('task.weekday.title') }}</Label>
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="(day, index) in weekdayOptions"
        :key="index"
        type="button"
        size="sm"
        :variant="localSelected.includes(index) ? 'default' : 'outline'"
        :aria-pressed="localSelected.includes(index)"
        :data-testid="`weekday-option-${index}`"
        class="rounded-full select-none"
        @click="toggleDay(index)"
      >
        {{ day }}
      </Button>
    </div>

    <div class="mt-2 flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="ghost" @click="selectWorkdays">
        {{ t('task.weekday.workdays') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="selectWeekends">
        {{ t('task.weekday.weekends') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="selectAll">
        {{ t('task.weekday.selectAll') }}
      </Button>

      <Button type="button" size="sm" variant="ghost" @click="clearAll">
        {{ t('task.weekday.clear') }}
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

const weekdayOptions = computed(() => [
  t('task.weekday.sun'),
  t('task.weekday.mon'),
  t('task.weekday.tue'),
  t('task.weekday.wed'),
  t('task.weekday.thu'),
  t('task.weekday.fri'),
  t('task.weekday.sat'),
]);

const toggleDay = (index: number) => {
  const current = localSelected.value;
  if (current.includes(index)) {
    localSelected.value = current.filter((d) => d !== index);
  } else {
    localSelected.value = [...current, index];
  }
};

// 快捷选择方法
const selectWorkdays = () => {
  localSelected.value = [1, 2, 3, 4, 5]; // 周一到周五
};

const selectWeekends = () => {
  localSelected.value = [0, 6]; // 周日和周六
};

const selectAll = () => {
  localSelected.value = [0, 1, 2, 3, 4, 5, 6];
};

const clearAll = () => {
  localSelected.value = [];
};
</script>
