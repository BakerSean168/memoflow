<script setup lang="ts">
import type { DropdownMenuSubContentEmits, DropdownMenuSubContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../../lib/utils'
import {
  DropdownMenuSubContent,

  useForwardPropsEmits,
} from 'reka-ui'
import { computed } from 'vue'

const props = defineProps<DropdownMenuSubContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DropdownMenuSubContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuSubContent
    v-bind="forwarded"
    :class="cn('z-50 min-w-32 overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-1 text-popover-foreground shadow-[0_16px_40px_-20px_rgba(0,0,0,0.5),0_4px_12px_-8px_rgba(0,0,0,0.38),inset_0_1px_0_hsl(var(--foreground)/0.025)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1', props.class)"
  >
    <slot />
  </DropdownMenuSubContent>
</template>
