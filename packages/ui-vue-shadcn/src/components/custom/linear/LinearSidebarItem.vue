<script setup lang="ts">
import { cn } from '../../../lib/utils';

const props = defineProps<{
  label: string;
  active?: boolean;
  count?: number | string;
  class?: string;
}>();
</script>

<template>
  <button
    :class="
      cn(
        'flex items-center w-full gap-2 px-3 py-1.5 text-sm rounded-md transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        props.active ? 'bg-muted/80 text-foreground font-medium' : '',
        props.class,
      )
    "
  >
    <slot name="icon" />
    <span>{{ props.label }}</span>
    <span v-if="props.count" class="ml-auto text-xs opacity-60">{{ props.count }}</span>
  </button>
</template>
