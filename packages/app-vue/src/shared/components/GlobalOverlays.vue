<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue';
import { useKeyboardRuntime } from '../keyboard/runtime';
import '../keyboard/keyboard.css';
useKeyboardRuntime();

const KeyboardHelp = defineAsyncComponent(() => import('./KeyboardHelp.vue'));
const ready = ref(false);
const GlobalConfirmDialog = defineAsyncComponent(() => import('./GlobalConfirmDialog.vue'));
const GlobalSheet = defineAsyncComponent(() => import('./GlobalSheet.vue'));
const GlobalCommandPalette = defineAsyncComponent(() => import('./GlobalCommandPalette.vue'));

onMounted(() => {
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
</script>

<template>
  <template v-if="ready">
    <GlobalConfirmDialog />
    <GlobalSheet />
    <GlobalCommandPalette />
    <KeyboardHelp />
  </template>
</template>
