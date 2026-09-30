<template>
  <div class="relative w-full">
    <Search
      class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      type="text"
      autocomplete="off"
      :model-value="modelValue"
      class="h-8 rounded-md border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.5)] pl-8 pr-8 text-sm shadow-none"
      :placeholder="placeholder"
      :aria-label="accessibleLabel ?? placeholder"
      :data-testid="testId"
      @update:model-value="emit('update:modelValue', String($event ?? ''))"
      @keyup.enter="emit('submit')"
      @keyup.esc="emit('clear')"
    />
    <button
      v-if="modelValue"
      type="button"
      class="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-sm text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground"
      :aria-label="clearLabel"
      :data-testid="testId ? `${testId}-clear` : undefined"
      @click="emit('clear')"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { Input } from '@memoflow/ui-vue-shadcn';

withDefaults(
  defineProps<{
    modelValue: string;
    placeholder: string;
    clearLabel: string;
    accessibleLabel?: string;
    testId?: string;
  }>(),
  {
    accessibleLabel: undefined,
    testId: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  clear: [];
}>();
</script>
