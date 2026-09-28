<script lang="ts" setup>
import type { DateValue } from '@internationalized/date'
import { isSameMonth } from '@internationalized/date'
import { Redo2, Undo2 } from '@lucide/vue'
import { injectCalendarRootContext } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '../../../lib/utils'

const props = withDefaults(
  defineProps<{
    date?: DateValue
    class?: string
    label?: string
  }>(),
  {
    date: undefined,
    class: '',
    label: 'Return to today',
  },
)

const root = injectCalendarRootContext()

const visible = computed(
  () => props.date != null && !isSameMonth(root.placeholder.value, props.date),
)

const direction = computed<'left' | 'right'>(() => {
  if (!props.date) return 'left'

  const visibleMonth = root.placeholder.value.year * 12 + root.placeholder.value.month
  const returnMonth = props.date.year * 12 + props.date.month

  return visibleMonth < returnMonth ? 'right' : 'left'
})

function returnToSelected(): void {
  if (props.date) root.onPlaceholderChange(props.date)
}
</script>

<template>
  <button
    v-if="visible"
    type="button"
    :aria-label="label"
    :title="label"
    :class="
      cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground/70 transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        props.class,
      )
    "
    data-testid="calendar-return-to-selected"
    :data-direction="direction"
    @click="returnToSelected"
  >
    <Redo2 v-if="direction === 'right'" class="h-3.5 w-3.5" />
    <Undo2 v-else class="h-3.5 w-3.5" />
  </button>
</template>
