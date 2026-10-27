<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    data-testid="memoflow-ai-icon"
  >
    <path d="M2 8.5c3 3 5.5-1 8.5 6 3 3 6-4.5 11-10.5" />
    <path d="M2 13.5c3 2.5 5.5 0 8.5 2 3 2.5 6-2 11-7.5" />
    <path d="M2 18.5c3 1.5 5.5-0.5 8.5-1.5 3 2 6 0 11-4.5" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    strokeWidth?: number | string;
  }>(),
  {
    strokeWidth: 1.75,
  },
);
</script>
