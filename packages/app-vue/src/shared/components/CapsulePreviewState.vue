<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    kind: 'loading' | 'error' | 'empty' | 'info';
    layout?: 'auto' | 'stack' | 'center';
  }>(),
  {
    layout: 'auto',
  },
);

const resolvedLayout = computed(() => {
  if (props.layout !== 'auto') return props.layout;
  return props.kind === 'loading' ? 'stack' : 'center';
});

const stateClass = computed(() =>
  resolvedLayout.value === 'stack'
    ? 'space-y-1.5 py-3'
    : 'flex flex-col items-center justify-center gap-2 py-7 text-center',
);

const role = computed(() => {
  if (props.kind === 'error') return 'alert';
  return 'status';
});
</script>

<template>
  <div
    :class="stateClass"
    :role="role"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
    :data-capsule-preview-state="kind"
  >
    <slot />
  </div>
</template>
