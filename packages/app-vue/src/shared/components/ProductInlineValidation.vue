<script setup lang="ts">
withDefaults(
  defineProps<{
    visible: boolean;
    message: string;
    id?: string;
    testId?: string;
  }>(),
  { id: undefined, testId: undefined },
);
</script>

<template>
  <!-- Stable one-line slot: validation never resizes the editor or pushes its fields. -->
  <div class="min-h-4" aria-live="polite">
    <p
      v-if="visible"
      :id="id"
      :data-testid="testId"
      role="alert"
      class="truncate text-xs leading-4 text-[hsl(var(--foreground-muted))]"
      :title="message"
    >
      {{ message }}
    </p>
  </div>
</template>
