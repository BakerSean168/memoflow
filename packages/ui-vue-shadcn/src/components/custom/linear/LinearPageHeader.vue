<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    class="sticky top-0 z-10 flex min-h-11 items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.82)] px-4 py-2 shadow-[0_1px_0_hsl(var(--border)/0.04)] backdrop-blur-sm"
  >
    <div class="min-w-0">
      <h1 class="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{{ title }}</h1>
      <p v-if="description" class="mt-0.5 truncate text-[11px] text-[hsl(var(--foreground-subtle))]">
        {{ description }}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <slot name="actions" />
    </div>
  </div>
</template>
