<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { SheetVariants } from '.'
import { cn } from '../../../lib/utils'
import { Cross2Icon } from '@radix-icons/vue'
import {
  DialogClose,
  DialogContent,

  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { computed } from 'vue'
import { sheetVariants } from '.'

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: SheetVariants['side']
  hideClose?: boolean
}

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<SheetContentProps>()

const emits = defineEmits<DialogContentEmits>()

const delegatedProps = computed(() => {
  const { class: _class, side: _side, hideClose: _hideClose, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      :class="cn(sheetVariants({ side }), props.class)"
      v-bind="{ ...forwarded, ...$attrs }"
    >
      <slot />

      <DialogClose
        v-if="!props.hideClose"
        class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] opacity-80 transition-[background-color,color,opacity] hover:bg-[hsl(var(--hover))] hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/70 disabled:pointer-events-none data-[state=open]:bg-[hsl(var(--selected))]"
      >
        <Cross2Icon class="h-3.5 w-3.5" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
