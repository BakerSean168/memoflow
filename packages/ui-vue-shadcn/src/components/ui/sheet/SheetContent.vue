<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { SheetVariants } from '.';
import { dialogOverlayMotionClass } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import { Cross2Icon } from '@radix-icons/vue';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui';
import { computed } from 'vue';
import { sheetVariants } from '.';

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class'];
  side?: SheetVariants['side'];
  hideClose?: boolean;
  closeLabel?: string;
}

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<SheetContentProps>(), { closeLabel: 'Close' });

const emits = defineEmits<DialogContentEmits>();

const delegatedProps = computed(() => {
  const {
    class: _class,
    side: _side,
    hideClose: _hideClose,
    closeLabel: _closeLabel,
    ...delegated
  } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      :class="cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]', dialogOverlayMotionClass)"
    />
    <DialogContent
      :class="cn(sheetVariants({ side }), props.class)"
      v-bind="{ ...forwarded, ...$attrs }"
    >
      <slot />

      <DialogClose
        v-if="!props.hideClose"
        :aria-label="props.closeLabel"
        class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] opacity-80 transition-[background-color,color,opacity] hover:bg-[hsl(var(--hover))] hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/70 disabled:pointer-events-none data-[state=open]:bg-[hsl(var(--selected))]"
      >
        <Cross2Icon class="h-3.5 w-3.5" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
