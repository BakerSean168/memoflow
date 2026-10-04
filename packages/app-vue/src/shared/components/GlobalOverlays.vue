<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { toggleCommandPalette } from '@memoflow/ui-vue-shadcn';

const ready = ref(false);
const GlobalConfirmDialog = defineAsyncComponent(() => import('./GlobalConfirmDialog.vue'));
const GlobalSheet = defineAsyncComponent(() => import('./GlobalSheet.vue'));
const GlobalCommandPalette = defineAsyncComponent(() => import('./GlobalCommandPalette.vue'));

function handleGlobalShortcut(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    toggleCommandPalette();
  }
}

onMounted(() => {
  // The shortcut belongs to the eager host rather than the lazy palette UI.
  // This keeps Ctrl/Cmd+K responsive during the first idle-loading window:
  // state can open immediately and the async dialog will render open once loaded.
  window.addEventListener('keydown', handleGlobalShortcut);

  const reveal = () => {
    ready.value = true;
  };

  const win = globalThis as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  };

  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(reveal, { timeout: 3000 });
    return;
  }

  globalThis.setTimeout(reveal, 0);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalShortcut);
});
</script>

<template>
  <template v-if="ready">
    <GlobalConfirmDialog />
    <GlobalSheet />
    <GlobalCommandPalette />
  </template>
</template>
