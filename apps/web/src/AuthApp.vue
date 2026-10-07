<script setup lang="ts">
import { computed } from 'vue';
import DeviceAuthorizationView from './auth/DeviceAuthorizationView.vue';
import OAuthPopupCompleteView from './auth/OAuthPopupCompleteView.vue';
import WebAuthView from './auth/WebAuthView.vue';
import ExternalAgentAuthorizationView from './auth/ExternalAgentAuthorizationView.vue';

const pathname = computed(() => window.location.pathname);
const isDeviceAuthorization = computed(() => pathname.value === '/auth/device');
const isOAuthPopupCompletion = computed(() => pathname.value === '/auth/popup-complete');
</script>

<template>
  <OAuthPopupCompleteView v-if="isOAuthPopupCompletion" />
  <DeviceAuthorizationView v-else-if="isDeviceAuthorization" />
  <ExternalAgentAuthorizationView v-else-if="pathname === '/auth/external-agent'" />
  <WebAuthView v-else />
</template>
