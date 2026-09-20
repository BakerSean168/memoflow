<template>
  <Button
    type="button"
    variant="outline"
    size="sm"
    class="h-8 max-w-full justify-start gap-1.5 rounded-full px-3 font-normal transition-colors"
    :class="active ? 'border-foreground/20 bg-accent text-accent-foreground' : ''"
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
