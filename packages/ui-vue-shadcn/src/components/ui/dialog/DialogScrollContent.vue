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
    <DialogOverlay
      :class="
        cn(
          'fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 backdrop-blur-[2px]',
          dialogOverlayMotionClass,
        )
      "
    >
      <DialogContent
        v-bind="contentBindings"
        :class="
          cn(
            'relative z-50 my-8 grid w-full max-w-lg gap-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-6 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.72),0_8px_24px_-18px_rgba(0,0,0,0.55),inset_0_1px_0_hsl(var(--foreground)/0.03)] md:w-full',
            dialogContentMotionClass,
            props.class,
          )
        "
        @pointer-down-outside="
          (event) => {
            const originalEvent = event.detail.originalEvent;
            const target = originalEvent.target as HTMLElement;
            if (
              originalEvent.offsetX > target.clientWidth ||
              originalEvent.offsetY > target.clientHeight
            ) {
              event.preventDefault();
            }
          }
        "
      >
        <slot />
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
