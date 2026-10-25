<script setup lang="ts">
import type { Hm } from '@memoflow/time';
import { asHm } from '@memoflow/time';
import { computed, useId } from 'vue';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

const props = withDefaults(
  defineProps<{
    modelValue?: Hm | null;
    id?: string;
    label?: string;
    disabled?: boolean;
    error?: string | null;
  }>(),
  {
    modelValue: null,
    label: 'Time',
    disabled: false,
    error: null,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: Hm | null): void;
}>();

const generatedId = useId();
const fieldId = computed(() => props.id ?? `time-field-${generatedId}`);
const errorId = computed(() => `${fieldId.value}-error`);

function updateTime(value: string | number) {
  const raw = String(value);
  if (!raw) {
    emit('update:modelValue', null);
    return;
  }
  emit('update:modelValue', asHm(raw));
}
</script>

<template>
  <div class="grid gap-1.5">
    <Label :for="fieldId">{{ label }}</Label>
    <Input
      :id="fieldId"
      type="time"
      :model-value="modelValue ?? ''"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? errorId : undefined"
      @update:model-value="updateTime"
    />
    <p v-if="error" :id="errorId" class="text-xs text-destructive" role="alert">
      {{ error }}
    </p>
  </div>
</template>
