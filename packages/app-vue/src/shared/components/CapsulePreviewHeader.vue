<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();

defineSlots<{
  badge?: () => unknown;
  actions?: () => unknown;
  default?: () => unknown;
}>();
</script>

<template>
  <div
    class="shrink-0 border-b border-[hsl(var(--border-subtle))] pb-2"
    data-capsule-preview-header
  >
    <div class="flex min-w-0 items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-xs font-semibold text-foreground">{{ title }}</p>
          <slot name="badge" />
        </div>
        <p v-if="subtitle" class="mt-0.5 truncate text-[10px] text-muted-foreground">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </div>
</template>
