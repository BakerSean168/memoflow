<script setup lang="ts">
import type { PopoverContentEmits, PopoverContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reducedMotionClass } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import { PopoverContent, PopoverPortal, useForwardPropsEmits } from 'reka-ui';
import { computed } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    align: 'center',
    sideOffset: 4,
  },
);
const emits = defineEmits<PopoverContentEmits>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'z-50 w-72 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-4 text-popover-foreground shadow-[0_18px_48px_-22px_rgba(0,0,0,0.52),0_4px_14px_-10px_rgba(0,0,0,0.45),inset_0_1px_0_hsl(var(--foreground)/0.025)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
          reducedMotionClass,
          props.class,
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
