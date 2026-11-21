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

<style scoped>
/* A decorative miniature of the task workspace; geometry scales with the card. */
.theme-preview {
  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: 1.85;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.preview-pane {
  position: absolute;
  inset: 0;
  background: #fdfdfc;
  --preview-sidebar: #f3f3f1;
  --preview-surface: #ffffff;
  --preview-line: #d6d6d2;
  --preview-border: #e2e2de;
}
.preview-pane.dark {
  background: #101010;
  --preview-sidebar: #151515;
  --preview-surface: #191919;
  --preview-line: #393939;
  --preview-border: #303030;
}
.preview-pane.split-pane.light {
  clip-path: inset(0 50% 0 0);
}
.preview-pane.split-pane.dark {
  clip-path: inset(0 0 0 50%);
}
.preview-sidebar {
  position: absolute;
  inset: 0 auto 0 0;
  width: 24%;
  background: var(--preview-sidebar);
  border-right: 1px solid var(--preview-border);
}
.preview-search {
  position: absolute;
  left: 14%;
  top: 10%;
  height: 8%;
  width: 70%;
  background: var(--preview-surface);
  border: 1px solid var(--preview-border);
  border-radius: 4px;
}
.preview-nav-line {
  position: absolute;
  left: 14%;
  height: 6%;
  width: 64%;
  background: var(--preview-line);
  border-radius: 2px;
}
.preview-heading {
  position: absolute;
  left: 31%;
  top: 13%;
  height: 7%;
  width: 30%;
  background: var(--preview-line);
  border-radius: 2px;
}
.preview-task {
  position: absolute;
  left: 30%;
  right: 7%;
  height: 13%;
  display: flex;
  align-items: center;
  gap: 7%;
  padding-inline: 4%;
  background: var(--preview-surface);
  border: 1px solid var(--preview-border);
  border-radius: 4px;
}
.preview-check {
  display: block;
  aspect-ratio: 1;
  height: 42%;
  border: 1px solid var(--preview-border);
  border-radius: 50%;
}
.preview-check.completed {
  background: var(--preview-accent);
  border-color: var(--preview-accent);
}
.preview-task-line {
  display: block;
  height: 24%;
  background: var(--preview-line);
  border-radius: 2px;
}
.preview-action {
  position: absolute;
  bottom: 8%;
  right: 7%;
  height: 6%;
  width: 17%;
  background: var(--preview-accent);
  border-radius: 2px;
}
</style>
