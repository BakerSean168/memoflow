<script setup lang="ts">
import { vKeyboardList } from '../keyboard/list-adapter';
withDefaults(
  defineProps<{
    maxHeight?: string;
  }>(),
  {
    maxHeight: '30rem',
  },
);
</script>

<template>
  <div
    v-keyboard-list
    class="flex min-h-0 flex-col"
    :style="{ maxHeight }"
    data-capsule-preview-shell
  >
    <slot />
  </div>
</template>
