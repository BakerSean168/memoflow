<!--
  Adapted from T3 Code ComposerSurface.tsx at 0b42e2e2febf51627d6c150be686c02d26ef2739.
  Copyright (c) 2026 T3 Tools Inc. MIT License; see THIRD_PARTY_NOTICES.md.
-->
<template>
  <div class="composer-shell relative isolate w-full min-w-0" data-slot="composer-shell">
    <div
      class="composer-host relative w-full rounded-2xl"
      :class="{ 'composer-host-dragging': dragging }"
      data-slot="composer-host"
      data-testid="ai-composer-surface"
    >
      <div class="relative min-w-0 rounded-2xl p-px" data-chat-composer-main-surface="true">
        <div :class="density === 'comfortable' ? 'px-4 pb-3 pt-4' : 'px-3 pb-2 pt-3'">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComposerDensity } from '../ai-ui-host';
defineProps<{ density: ComposerDensity; dragging: boolean }>();
</script>

<style scoped>
.composer-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 1rem;
  pointer-events: none;
  background: hsl(var(--surface-overlay));
}
@supports (backdrop-filter: blur(1px)) {
  .composer-shell::before {
    background: hsl(var(--surface-overlay) / 0.94);
    backdrop-filter: blur(24px);
  }
}
.composer-host {
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
}
.composer-host::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 1px solid hsl(var(--border-subtle));
  border-radius: inherit;
  pointer-events: none;
}
.composer-host-dragging::after {
  border-color: hsl(var(--primary) / 0.6);
  background: hsl(var(--primary) / 0.04);
}
:global(.dark) .composer-host {
  box-shadow: none;
}
</style>
