<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    testId?: string;
  }>(),
  {
    description: undefined,
    testId: undefined,
  },
);
</script>

<template>
  <section
    class="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-4"
    :data-testid="testId"
  >
    <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 space-y-1">
        <h2 class="text-sm font-semibold text-destructive">{{ title }}</h2>
        <p v-if="description" class="max-w-2xl text-xs leading-5 text-muted-foreground">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="$slots.default" class="mt-4 min-w-0">
      <slot />
    </div>
  </section>
</template>
