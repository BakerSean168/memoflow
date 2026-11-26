<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { cn } from '../../../lib/utils';
import { useVModel } from '@vueuse/core';

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes['class'];
  type?: string;
}>();

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void;
}>();

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
});
const inputClass = computed(() =>
  cn(
    'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
  ),
);
</script>

<template>
  <!-- A file input is uncontrolled: browsers reject assigning a filename. -->
  <input v-if="props.type === 'file'" type="file" :class="inputClass" />
  <input v-else v-model="modelValue" :type="props.type" :class="inputClass" />
</template>
