<template>
  <Button
    type="button"
    variant="outline"
    size="sm"
    class="h-8 max-w-full justify-start gap-1.5 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.48)] px-3 font-normal text-[hsl(var(--foreground-muted))] shadow-none transition-colors hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
    :class="active ? 'border-[hsl(var(--border))] bg-[hsl(var(--selected))] text-foreground' : ''"
    :disabled="disabled"
    :aria-pressed="active === undefined ? undefined : active"
    data-slot="product-property-chip"
  >
    <span
      v-if="$slots.icon"
      class="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <slot name="icon" />
    </span>
    <span class="min-w-0 truncate"><slot /></span>
  </Button>
</template>

<script setup lang="ts">
import { Button } from '@memoflow/ui-vue-shadcn';

withDefaults(
  defineProps<{
    active?: boolean;
    disabled?: boolean;
  }>(),
  {
    active: undefined,
    disabled: false,
  },
);
</script>
