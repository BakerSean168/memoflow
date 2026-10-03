<template>
  <Collapsible
    :open="open"
    class="overflow-hidden rounded-xl bg-[hsl(var(--surface-raised)/0.28)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]"
    @update:open="emit('update:open', $event)"
  >
    <template #default="{ open: currentOpen }">
      <CollapsibleTrigger as-child>
        <slot name="trigger" :open="currentOpen" />
      </CollapsibleTrigger>
      <slot name="static" :open="currentOpen" />
      <CollapsibleContent>
        <div
          class="origin-top border-t border-[hsl(var(--border-subtle))] transition-[opacity,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none"
          :class="currentOpen ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'"
          data-testid="product-expandable-content"
        >
          <slot :open="currentOpen" />
        </div>
      </CollapsibleContent>
    </template>
  </Collapsible>
</template>

<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@memoflow/ui-vue-shadcn';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
</script>
