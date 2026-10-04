<script setup lang="ts">
import type { AlertDialogContentEmits, AlertDialogContentProps } from 'reka-ui';
import type { Component, HTMLAttributes } from 'vue';
import { dialogContentMotionClass, dialogOverlayMotionClass } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import {
  AlertDialogContent as AlertDialogContentPrimitive,
  AlertDialogOverlay,
  AlertDialogPortal,
  useForwardPropsEmits,
} from 'reka-ui';
import { computed, useAttrs } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<AlertDialogContentProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<AlertDialogContentEmits>();
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
const AlertDialogContent = AlertDialogContentPrimitive as Component;
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay :class="cn('fixed inset-0 z-[60] bg-black/80', dialogOverlayMotionClass)" />
    <AlertDialogContent
      v-bind="contentBindings"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-[61] grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          dialogContentMotionClass,
          props.class,
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
