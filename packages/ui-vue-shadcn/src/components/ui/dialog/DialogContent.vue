<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { dialogContentMotionClass, dialogOverlayMotionClass } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import { DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from 'reka-ui';
import { computed, useAttrs } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<DialogContentEmits>();
const attrs = useAttrs();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
const contentBindings = computed(() => ({
  ...forwarded.value,
  ...attrs,
}));
</script>

<template>
  <DialogPortal>
    <DialogOverlay :class="cn('fixed inset-0 z-50 bg-black/80', dialogOverlayMotionClass)" />
    <DialogContent
      v-bind="contentBindings"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          dialogContentMotionClass,
          props.class,
        )
      "
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
