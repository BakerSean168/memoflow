<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'
import { useForwardPropsEmits } from 'reka-ui'
import { computed } from 'vue'
import Command from './Command.vue'

const props = withDefaults(defineProps<DialogRootProps & {
  title?: string
  description?: string
}>(), {
  title: 'Command palette',
  description: 'Search for a command to run.',
})
const emits = defineEmits<DialogRootEmits>()

const delegatedProps = computed(() => {
  const { title: _, description: __, ...delegated } = props
  return delegated
})
const forwarded = useForwardPropsEmits(delegatedProps, emits)

function handleEscapeKey(): void {
  emits('update:open', false)
}
</script>

<template>
  <Dialog v-bind="forwarded">
    <DialogContent class="overflow-hidden p-0 shadow-lg" @keydown.esc.capture="handleEscapeKey">
      <DialogTitle class="sr-only">{{ title }}</DialogTitle>
      <DialogDescription class="sr-only">{{ description }}</DialogDescription>
      <Command class="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
        <slot />
      </Command>
    </DialogContent>
  </Dialog>
</template>
