<script setup lang="ts">
import { cn } from '../../../lib/utils';

const props = defineProps<{
  title: string;
  subtitle?: string;
  active?: boolean;
  class?: string;
}>();
</script>

<template>
  <div
    :class="
      cn(
        'flex items-center gap-3 px-3 py-2 border-b border-border/40 hover:bg-muted/30 transition-colors group cursor-pointer',
        props.active ? 'bg-muted/50' : '',
        props.class,
      )
    "
  >
    <div class="flex items-center">
      <slot name="prefix" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium text-foreground truncate leading-none">{{ props.title }}</div>
      <div v-if="props.subtitle" class="text-xs text-muted-foreground truncate mt-1">
        {{ props.subtitle }}
      </div>
    </div>
    <div class="flex items-center gap-2 text-muted-foreground/50 text-xs">
      <slot name="meta" />
    </div>
    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
      <slot name="actions" />
    </div>
  </div>
</template>
