<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    align?: 'start' | 'between' | 'end';
  }>(),
  {
    align: 'end',
  },
);

const alignmentClass = computed(() => {
  if (props.align === 'start') return 'justify-start';
  if (props.align === 'between') return 'justify-between';
  return 'justify-end';
});
</script>

<template>
  <div
    class="flex shrink-0 items-center border-t border-[hsl(var(--border-subtle))] pt-2"
    :class="alignmentClass"
    data-capsule-preview-footer
  >
    <slot />
  </div>
</template>
