<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { Toaster } from '@memoflow/ui-vue-shadcn/components/ui/sonner';
import { GlobalErrorBoundary } from '@memoflow/app-vue';
import { DesktopProfileAccessView } from '@memoflow/app-vue/desktop';

// Same lightweight host as GlobalOverlays, without booting the main-window shell.
const GlobalConfirmDialog = defineAsyncComponent(
  () => import('@memoflow/app-vue/shared/components/GlobalConfirmDialog.vue'),
);
</script>

<template>
  <div class="desktop-auth-shell">
    <GlobalErrorBoundary>
      <DesktopProfileAccessView />
    </GlobalErrorBoundary>
  </div>

  <GlobalConfirmDialog />

  <Toaster
    class="desktop-auth-toaster"
    position="top-center"
    :duration="3000"
    :offset="{ top: 60, left: 16, right: 16 }"
    :mobile-offset="{ top: 60, left: 16, right: 16 }"
    rich-colors
  />
</template>

<style>
:root {
  color-scheme: dark;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
  background-color: transparent !important;
}

.desktop-auth-shell {
  height: 100%;
  overflow: hidden;
  background: transparent;
}

.desktop-auth-toaster {
  z-index: 12000;
}
</style>
