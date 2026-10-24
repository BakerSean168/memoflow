<script setup lang="ts">
import { computed, useId } from 'vue';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    id?: string;
    label?: string;
    suffix?: string;
    disabled?: boolean;
    error?: string | null;
  }>(),
  {
    modelValue: null,
    label: 'Reminder',
    suffix: 'min before',
    disabled: false,
    error: null,
  },
);
const emit = defineEmits<{ (event: 'update:modelValue', value: number | null): void }>();
const generatedId = useId();
const fieldId = computed(() => props.id ?? `reminder-offset-field-${generatedId}`);
const errorId = computed(() => `${fieldId.value}-error`);
function update(value: string | number) {
  const raw = String(value);
  emit('update:modelValue', raw === '' ? null : Math.max(0, Math.round(Number(raw))));
}
</script>

<template>
  <div class="grid gap-1.5">
    <Label :for="fieldId">{{ label }}</Label>
    <div class="relative">
      <Input
        :id="fieldId"
        type="number"
        class="pr-20"
        :model-value="modelValue ?? ''"
        min="0"
        step="1"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? errorId : undefined"
        @update:model-value="update"
      />
      <span
        class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
      >
        {{ suffix }}
      </span>
    </div>
    <p v-if="error" :id="errorId" class="text-xs text-destructive" role="alert">{{ error }}</p>
  </div>
</template>
