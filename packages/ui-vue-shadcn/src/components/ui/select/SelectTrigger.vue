<script setup lang="ts">
import type { SelectTriggerProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '../../../lib/utils';
import { CaretSortIcon } from '@radix-icons/vue';
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui';
import { cva } from 'class-variance-authority';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<SelectTriggerProps & { class?: HTMLAttributes['class']; size?: 'sm' | 'default' }>(),
  { size: 'default' },
);

const selectTriggerVariants = cva(
  'flex w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start',
  {
    variants: {
      size: {
        default: 'h-9 px-3 py-2 text-sm',
        sm: 'h-8 px-3 text-xs',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const delegatedProps = computed(() => {
  const { class: _, size: __, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    v-bind="forwardedProps"
    :class="cn(selectTriggerVariants({ size: props.size }), props.class)"
  >
    <slot />
    <SelectIcon as-child>
      <CaretSortIcon class="w-4 h-4 opacity-50 shrink-0" />
    </SelectIcon>
  </SelectTrigger>
</template>
