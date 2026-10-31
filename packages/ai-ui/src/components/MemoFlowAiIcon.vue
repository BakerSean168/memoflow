<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="{ 'memoflow-ai-active': active }"
    aria-hidden="true"
    data-testid="memoflow-ai-icon"
  >
    <g v-if="active" class="memoflow-ai-beams" stroke-width="1.25">
      <path class="memoflow-ai-incoming" pathLength="1" d="M0 2L10 12 M0 12H10 M0 22L10 12" />
      <path class="memoflow-ai-outgoing" pathLength="1" d="M12 12H24" />
    </g>
    <path d="M2 8.5c3 3 5.5-1 8.5 6 3 3 6-4.5 11-10.5" />
    <path d="M2 13.5c3 2.5 5.5 0 8.5 2 3 2.5 6-2 11-7.5" />
    <path d="M2 18.5c3 1.5 5.5-0.5 8.5-1.5 3 2 6 0 11-4.5" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    strokeWidth?: number | string;
    active?: boolean;
  }>(),
  {
    strokeWidth: 1.75,
  },
);
</script>

<style scoped>
.memoflow-ai-active {
  overflow: visible;
}
.memoflow-ai-incoming {
  stroke-dasharray: 0.2 0.8;
  animation: memoflow-ai-flow 1.6s linear infinite;
}
.memoflow-ai-outgoing {
  animation: memoflow-ai-pulse 1.6s ease-in-out infinite;
}
@keyframes memoflow-ai-flow {
  to {
    stroke-dashoffset: -1;
  }
}
@keyframes memoflow-ai-pulse {
  50% {
    opacity: 0.3;
  }
}
@media (prefers-reduced-motion: reduce) {
  .memoflow-ai-incoming,
  .memoflow-ai-outgoing {
    animation: none;
  }
  .memoflow-ai-incoming {
    stroke-dasharray: none;
  }
}
@media (forced-colors: active) {
  .memoflow-ai-beams {
    stroke: CanvasText;
  }
}
</style>
