<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ theme: 'auto' | 'light' | 'dark'; accent: string }>();
const panes = computed(() => (props.theme === 'auto' ? ['light', 'dark'] : [props.theme]));
</script>

<template>
  <span aria-hidden="true" class="theme-preview" :style="{ '--preview-accent': accent }">
    <span
      v-for="pane in panes"
      :key="pane"
      class="preview-pane"
      :class="[pane, { 'split-pane': theme === 'auto' }]"
    >
      <span class="preview-sidebar">
        <span class="preview-search" />
        <span
          v-for="row in 3"
          :key="row"
          class="preview-nav-line"
          :style="{ top: `${24 + (row - 1) * 11}%`, opacity: 1 - row * 0.16 }"
        />
      </span>
      <span class="preview-heading" />
      <span
        v-for="row in 3"
        :key="row"
        class="preview-task"
        :style="{ top: `${28 + (row - 1) * 19}%` }"
      >
        <span class="preview-check" :class="{ completed: row === 1 }" />
        <span class="preview-task-line" :style="{ width: `${65 - row * 8}%` }" />
      </span>
      <span class="preview-action" />
    </span>
  </span>
</template>
