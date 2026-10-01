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
    class="border-b border-[hsl(var(--border-subtle)/0.72)] pb-7 last:border-b-0 last:pb-0"
    :data-testid="testId"
  >
    <header class="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 space-y-1">
        <h2 class="text-sm font-semibold tracking-tight text-foreground">{{ title }}</h2>
        <p v-if="description" class="max-w-2xl text-xs leading-5 text-muted-foreground">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="$slots.default" class="min-w-0">
      <slot />
    </div>
  </section>
</template>
