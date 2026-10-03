<script setup lang="ts">
withDefaults(
  defineProps<{
    testId?: string;
  }>(),
  {
    testId: undefined,
  },
);
</script>

<template>
  <div
    class="rounded-lg border border-[hsl(var(--border-subtle)/0.78)] bg-[hsl(var(--surface-raised)/0.24)] p-4 shadow-[0_1px_0_hsl(var(--border)/0.03)]"
    :data-testid="testId"
  >
    <slot />
  </div>
</template>
