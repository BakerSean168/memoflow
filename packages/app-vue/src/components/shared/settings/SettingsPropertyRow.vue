<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    description?: string;
    htmlFor?: string;
    testId?: string;
    layout?: 'inline' | 'stacked';
  }>(),
  {
    description: undefined,
    htmlFor: undefined,
    testId: undefined,
    layout: 'inline',
  },
);
</script>

<template>
  <div
    class="min-w-0 py-3 first:pt-0 last:pb-0"
    :class="
      layout === 'inline'
        ? 'grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center'
        : 'space-y-2'
    "
    :data-testid="testId"
  >
    <div class="min-w-0 space-y-0.5">
      <label v-if="htmlFor" :for="htmlFor" class="text-sm font-medium text-foreground">
        {{ label }}
      </label>
      <p v-else class="text-sm font-medium text-foreground">{{ label }}</p>
      <p v-if="description" class="text-xs leading-5 text-muted-foreground">
        {{ description }}
      </p>
    </div>

    <div class="min-w-0" :class="layout === 'inline' ? 'sm:w-full sm:justify-self-end' : ''">
      <slot />
    </div>
  </div>
</template>
