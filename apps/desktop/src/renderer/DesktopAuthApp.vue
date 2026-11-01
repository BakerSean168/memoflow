<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Toaster } from '@memoflow/ui-vue-shadcn/components/ui/sonner';
import { GlobalErrorBoundary, useDesktopWindowControls } from '@memoflow/app-vue';
import { DesktopProfileAccessView } from '@memoflow/app-vue/desktop';
import { logo1024 } from '@memoflow/assets';
import { Minus, X } from '@lucide/vue';

// Same lightweight host as GlobalOverlays, without booting the main-window shell.
const GlobalConfirmDialog = defineAsyncComponent(
  () => import('@memoflow/app-vue/shared/components/GlobalConfirmDialog.vue'),
);

const { t } = useI18n();
const { minimizeWindow, closeWindow, startListening, stopListening } = useDesktopWindowControls();

onMounted(startListening);
onBeforeUnmount(stopListening);
</script>

<template>
  <div class="desktop-auth-shell">
    <!-- Brand art: the packaged logo, never a redrawn approximation. -->
    <img class="desktop-auth-shell__art" :src="logo1024" alt="" aria-hidden="true" />
    <div class="desktop-auth-shell__scrim" aria-hidden="true" />

    <header class="window-header window-header--drag desktop-auth-shell__titlebar">
      <button
        type="button"
        class="desktop-auth-shell__control"
        data-testid="desktop-auth-minimize"
        :aria-label="t('shell.window.minimize')"
        :title="t('shell.window.minimize')"
        @click="minimizeWindow"
      >
        <Minus class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="desktop-auth-shell__control desktop-auth-shell__control--close"
        data-testid="desktop-auth-close"
        :aria-label="t('shell.window.close')"
        :title="t('shell.window.close')"
        @click="closeWindow"
      >
        <X class="h-4 w-4" aria-hidden="true" />
      </button>
    </header>

    <main class="desktop-auth-shell__content">
      <GlobalErrorBoundary>
        <DesktopProfileAccessView />
      </GlobalErrorBoundary>
    </main>
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

/*
 * The identity window is one rounded, fixed-dark surface over the brand art:
 * the OS frame is off and the window is transparent, so the shell itself owns
 * the 18px corner and clips the art to it.
 */
.desktop-auth-shell {
  position: relative;
  height: 100%;
  overflow: hidden;
  border-radius: 18px;
  background-color: #0a0c11;
  /* Brand accent lands here for the fixed dark identity surface only. */
  --color-ring: hsl(var(--brand-gold-via));
}

.desktop-auth-shell__art {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  object-fit: cover;
  object-position: center;
  user-select: none;
  pointer-events: none;
}

.desktop-auth-shell__scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 50% 45%, rgba(8, 10, 16, 0.12) 0%, rgba(8, 10, 16, 0.68) 100%),
    linear-gradient(
      180deg,
      rgba(8, 10, 16, 0.58) 0%,
      rgba(8, 10, 16, 0.34) 45%,
      rgba(8, 10, 16, 0.76) 100%
    );
}

.desktop-auth-shell__titlebar {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  display: flex;
  height: 44px;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding: 0 8px;
}

.desktop-auth-shell__control {
  display: inline-flex;
  height: 28px;
  width: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: hsl(0 0% 88%);
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.desktop-auth-shell__control:hover {
  background-color: hsl(0 0% 100% / 0.12);
  color: hsl(0 0% 100%);
}

.desktop-auth-shell__control--close:hover {
  background-color: hsl(0 72% 51%);
  color: hsl(0 0% 100%);
}

.desktop-auth-shell__content {
  position: relative;
  z-index: 10;
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 56px 40px 40px;
}

.desktop-auth-toaster {
  z-index: 12000;
}
</style>
