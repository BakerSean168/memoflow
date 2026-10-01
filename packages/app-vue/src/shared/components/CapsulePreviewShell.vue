<script setup lang="ts">
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
  <div class="flex min-h-0 flex-col" :style="{ maxHeight }" data-capsule-preview-shell>
    <slot />
  </div>
</template>
