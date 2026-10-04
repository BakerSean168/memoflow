<script setup lang="ts">
import { computed } from 'vue';
import DeviceAuthorizationView from './auth/DeviceAuthorizationView.vue';
import OAuthPopupCompleteView from './auth/OAuthPopupCompleteView.vue';
import WebAuthView from './auth/WebAuthView.vue';

const pathname = computed(() => window.location.pathname);
const isDeviceAuthorization = computed(() => pathname.value === '/auth/device');
const isOAuthPopupCompletion = computed(() => pathname.value === '/auth/popup-complete');
</script>

<template>
  <OAuthPopupCompleteView v-if="isOAuthPopupCompletion" />
  <DeviceAuthorizationView v-else-if="isDeviceAuthorization" />
  <WebAuthView v-else />
</template>
